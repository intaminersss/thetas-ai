'use strict';
/* scheduler.js — in-process scheduler: digests, balance alerts, plan follow-ups,
   creative-age alerts, live per-ad alerts engine (idempotent by date/state keys). */
const db = require('./db');
const tg = require('./tg');
const adsapi = require('./adsapi');
const fmt = require('./format');
const livealerts = require('./handlers/livealerts');

const OWNER = () => Number((process.env.ALLOWED_USER_IDS || '7049127887').split(',')[0]);

let running = false;
async function tick(log) {
  if (running) return; running = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    /* daily digest @ 15:30 UTC = 21:00 IST */
    const nowUtc = new Date();
    const digestTime = nowUtc.getUTCHours() === 15 && nowUtc.getUTCMinutes() < 5;
    const digests = await db.q(`select a.* from alerts a where a.kind='daily_digest' and a.enabled=true
                                and (a.last_run_at is null or a.last_run_at::date < $1)`, [today]);
    for (const al of digests) {
      if (!digestTime && al.last_run_at) continue; // only send in the digest window once enabled
      try {
        const acct = await adsapi.getCurrentAccount();
        const ads = await adsapi.getAdsList();
        await tg.sm(al.tg_id, [
          `📰 <b>DAILY DIGEST — ${today}</b>`,
          `💰 Balance: <b>${acct.remaining_budget} TON</b>`,
          '',
          ...ads.map(a => fmt.adLine(a))
        ].join('\n'));
        await db.q(`update alerts set last_run_at=now() where id=$1`, [al.id]);
      } catch (e) { log(`digest error: ${e.message}`); }
    }
    /* balance alerts — checked hourly-ish via last_run_at spacing */
    const bals = await db.q(`select * from alerts where kind='balance_below' and enabled=true
                             and (last_run_at is null or last_run_at < now() - interval '1 hour')`);
    for (const al of bals) {
      try {
        const acct = await adsapi.getCurrentAccount();
        const th = Number(al.params?.threshold || 5);
        if (Number(acct.remaining_budget) < th) {
          await tg.sm(al.tg_id, `🚨 <b>BALANCE ALERT</b>: ${acct.remaining_budget} TON < ${th} TON — refill soon.`);
        }
        await db.q(`update alerts set last_run_at=now() where id=$1`, [al.id]);
      } catch (e) { log(`balance alert error: ${e.message}`); }
    }

    /* #21: morning digest @ 09:00 IST (03:30 UTC), once per day */
    const istHour = new Date(Date.now() + 5.5 * 3600e3).getUTCHours();
    if (istHour === 9 && nowUtc.getUTCMinutes() < 5) {
      const key = `digest_morning_${today}`;
      const done = (await db.q(`select value from agency_settings where key=$1`, [key]))?.[0]?.value;
      if (!done) {
        try {
          const acct = await adsapi.getCurrentAccount().catch(() => null);
          const ads = (await adsapi.getAdsList().catch(() => [])) || [];
          const active = ads.filter(a => a.status === 'active').length;
          const joins = ads.reduce((x, a) => x + (a.joins || 0), 0);
          const spent = ads.reduce((x, a) => x + (a.spent_budget || 0), 0);
          await tg.sm(OWNER(), [
            `☀️ <b>GOOD MORNING — ${today}</b>`,
            `💰 Balance: <b>${acct?.remaining_budget ?? '?'} TON</b>`,
            `📊 ${active}/${ads.length} ads active · 🚪 ${joins} joins lifetime · 💸 ${spent.toFixed(2)} TON spent`,
            `<i>Board kholo: 📊 My Ads. Naye tests: 🧪 Test Ad.</i>`
          ].join('\n'));
          await db.q(`insert into agency_settings(key,value) values ($1,'1') on conflict (key) do update set value='1'`, [key]);
        } catch (e) { log(`morning digest: ${e.message}`); }
      }
    }
    /* #14: plan follow-up reminders (7 days after a plan was sent) */
    try {
      const due = (await db.q(`select id,username from plans_archive where followup_at is null or (followup_at <= now() and not followup_sent) limit 3`)) || [];
      for (const pl of due) {
        await tg.sm(OWNER(), `📬 <b>Plan follow-up:</b> @${pl.username} ko plan ~7 din pehle bheja tha — client ka jawab le aao?`).catch(() => {});
        await db.q(`update plans_archive set followup_sent=true where id=$1`, [pl.id]);
      }
    } catch (e) { log(`followups: ${e.message}`); }
    /* #5: creative-age alerts (active ads older than 10 days, once per week) */
    try {
      const ads = (await adsapi.getAdsList().catch(() => [])) || [];
      const actives = ads.filter(a => a.status === 'active');
      for (const a of actives) {
        const f = await db.q(`select min(captured_at) f from ads_snapshot where ad_id=$1`, [a.ad_id]);
        const first = f?.[0]?.f;
        if (!first) continue;
        const age = Math.floor((Date.now() - new Date(first).getTime()) / 86400e3);
        if (age < 10) continue;
        const key = `age_alert_${a.ad_id}`;
        const last = (await db.q(`select value from agency_settings where key=$1`, [key]))?.[0]?.value;
        if (last && Date.now() - Number(last) < 7 * 86400e3) continue;
        await tg.sm(OWNER(), `⏳ <b>Creative age ${age}d</b> — Ad #${a.ad_id} abhi bhi active. Refresh ya clone karo (niche burnout fast hai).`).catch(() => {});
        await db.q(`insert into agency_settings(key,value) values ($1,$2) on conflict (key) do update set value=$2`, [key, String(Date.now())]);
      }
    } catch (e) { log(`age alerts: ${e.message}`); }
    /* #56: live per-ad alerts engine (1k views / joins / spend) */
    try { await livealerts.engine(log); } catch (e) { log(`live alerts: ${e.message}`); }
    /* STATUS-CHANGE ALERTS: in_review -> active (etc.) — instant ping to owner */
    try {
      const ads = (await adsapi.getAdsList().catch(() => [])) || [];
      const cur = Object.fromEntries(ads.map(a => [a.ad_id, a.status]));
      const prevRaw = (await db.q(`select value from agency_settings where key='ad_statuses'`))?.[0]?.value;
      const prev = prevRaw ? JSON.parse(prevRaw) : null;
      if (prev) {
        for (const [id, st] of Object.entries(cur)) {
          if (prev[id] && prev[id] !== st) {
            const emoji = st === 'active' ? '🟢' : st === 'in_review' ? '⏳' : st === 'paused' ? '💤' : 'ℹ️';
            await tg.sm(OWNER(), `${emoji} <b>AD #${id}: ${prev[id]} → ${st.toUpperCase()}</b>${st === 'active' ? '\n🚀 TRAFFIC LIVE — board kholo: 📊 My Ads' : ''}`).catch(() => {});
          }
        }
      }
      await db.q(`insert into agency_settings(key,value) values ('ad_statuses',$1) on conflict (key) do update set value=$1`, [JSON.stringify(cur)]);
    } catch (e) { log(`status alerts: ${e.message}`); }
  } finally { running = false; }
}

function start(log) { setInterval(() => tick(log).catch(e => log(`scheduler: ${e.message}`)), 5 * 60 * 1000).unref(); log('scheduler started (5-min tick)'); }

/* Serverless lazy-tick: atomically claim the next run via a dedicated
   agency_settings key (5-min min gap). Returns true only if this invocation
   won the claim and tick() ran — safe under concurrent lambda instances. */
const TICK_KEY = 'last_sched_tick';
async function maybeTick(log, gapMs = 5 * 60e3) {
  try {
    const now = Date.now();
    const won = await db.q(
      `insert into agency_settings(key,value) values ($1,$2)
       on conflict (key) do update set value = excluded.value
       where (agency_settings.value::bigint + $3::bigint) < $2::bigint
       returning value`,
      [TICK_KEY, String(now), String(gapMs)]);
    if (!won || !won.length) return false;
    await tick(log);
    return true;
  } catch (e) { if (log) log(`maybeTick: ${e.message}`); return false; }
}

module.exports = { start, tick, maybeTick };
