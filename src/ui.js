'use strict';
/* ui.js — THETAS AI design system (premium Telegram-native identity).
   Product: THETAS AI — Fully Built By Agency @TelesAds (Telesads.com)
   Philosophy adopted from telegram-bot-ui skill: the whole surface = text + keyboards + transitions + working-state feedback.
   Every visual is plain HTML that Telegram actually renders — no CSS illusions. */

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BRAND = { title: 'THETAS AI', mark: '▲', line: '━━━━━━━━━━━━━━━━━━━━', lineThin: '─────────────',
  credit: 'Fully Built By Agency @TelesAds · Telesads.com' };

/* Section header: brand bar + title */
const header = (icon, title) => `${BRAND.mark} <b>${BRAND.title}</b> ▸ ${icon} <b>${esc(title)}</b>\n${BRAND.line}`;

/* Status pill with fixed visual language */
const PILL = {
  active: '🟢 ACTIVE', on_hold: '⏸️ ON HOLD', paused: '⏸️ PAUSED',
  in_review: '🟡 IN REVIEW', declined: '❌ DECLINED', launched: '🚀 LAUNCHED',
  draft: '📝 DRAFT', failed: '❌ FAILED', archived: '📦 ARCHIVED'
};
const pill = s => PILL[s] || `⚪ ${esc(s || 'UNKNOWN')}`;

/* Real-fraction progress bar: filled = actual ratio (never fabricated) */
function bar(value, max, width = 10) {
  const v = Math.max(0, +value || 0), m = Math.max(0.000001, +max || 0);
  const filled = Math.min(width, Math.round((v / m) * width));
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

/* Spinner frames for real work phases (edited-message feedback) */
const SPIN = ['◜', '◠', '◝', '◞', '◡', '◟'];
const spin = i => SPIN[Math.abs(i) % SPIN.length];

/* Number formatting helpers */
const num = n => Number(n || 0).toLocaleString('en');
const inr = t => `₹${(t * 1.45 * 84).toFixed(0)}`; // TON→INR — ESTIMATE (fixed FX)
const ton = t => `${(+t || 0).toFixed(2)} TON`;

/* Custom emoji support — HONEST: only uses IDs provided via CUSTOM_EMOJI_IDS env map.
   No known IDs are bundled (none verified) → unicode fallback always available. */
let CUSTOM_EMOJI = {};
try { CUSTOM_EMOJI = JSON.parse(process.env.CUSTOM_EMOJI_IDS || '{}'); } catch { CUSTOM_EMOJI = {}; }
const hasCustom = name => Boolean(CUSTOM_EMOJI[name]);
/* Returns {text, entity?} — caller merges entities when sending (v2.1 when IDs provided) */
function cemoji(name, fallback) { return hasCustom(name) ? { text: '\u{E0000}', id: CUSTOM_EMOJI[name] } : { text: fallback }; }

/* Ad row — v2 premium compact card */
function adRow(a) {
  const { ad_id: id, views: v = 0, clicks: c = 0, joins: j = 0, spent_budget: s = 0 } = a;
  const jr = c ? (j / c * 100).toFixed(1) : '0.0';
  const cpj = j ? ` · <code>${inr(s / j)}/join</code>` : '';
  return `${pill(a.status)} <b>#${id}</b>\n      👀 <code>${num(v)}</code>  👆 <code>${num(c)}</code>  🚪 <code>${num(j)}</code>  JR <code>${jr}%</code>\n      💸 <code>${ton(s)}</code> (~${inr(s)})${cpj}`;
}

function adsBoard(ads) {
  if (!ads.length) return '📭 No ads in this account yet.\n<i>Launch your first draft from 📋 Drafts.</i>';
  const tv = ads.reduce((x, a) => x + (a.views || 0), 0), tc = ads.reduce((x, a) => x + (a.clicks || 0), 0);
  const tj = ads.reduce((x, a) => x + (a.joins || 0), 0), ts = ads.reduce((x, a) => x + (+a.spent_budget || 0), 0);
  const jr = tc ? (tj / tc * 100).toFixed(1) : '0.0';
  return [
    ...ads.map(adRow),
    '',
    `${BRAND.lineThin}`,
    `Σ <b>${ads.length} ads</b> · 👀 <code>${num(tv)}</code> 👆 <code>${num(tc)}</code> 🚪 <code>${num(tj)}</code> · JR <code>${jr}%</code>`,
    `Σ spend <code>${ton(ts)}</code> (~${inr(ts)})`
  ].join('\n');
}

/* Budget meter (real values only) */
const budgetMeter = (remaining, initial) =>
  `💼 <code>${bar(remaining, Math.max(remaining, initial || 0))}</code> ${ton(remaining)} free`;

/* Keyboard builder (t/c shorthand → Telegram shape) */
const kb = rows => ({
  inline_keyboard: (Array.isArray(rows) ? rows : [])
    .filter(r => Array.isArray(r) && r.length)
    .map(r => r.filter(b => b && (b.t || b.text)).map(b => {
      /* keep extra fields (style per Bot API 10.2) + accept t/c shorthand or native keys */
      const { t, c, u, text, callback_data, ...rest } = b;
      return { ...rest, text: t || text, callback_data: c || callback_data };
    }))
    .filter(r => r.length)
});

/* Pager rows: prev/next with honest page indicator */
function pagerRows(page, pages, base) {
  if (pages <= 1) return [];
  return [{ t: '◀️', c: `${base}:p${Math.max(0, page - 1)}` },
          { t: `${page + 1}/${pages}`, c: `${base}:noop` },
          { t: '▶️', c: `${base}:p${Math.min(pages - 1, page + 1)}` }];
}

/* Tiered menu — Operate / Automate / System (skill: group by meaning, primary action stands out) */
const MENU = kb([
  [{ t: '📊  My Ads', c: 'menu:ads', style: 'primary' }, { t: '📈  Reports', c: 'menu:rep', style: 'primary' }],
  [{ t: '🧪  New Test Ad', c: 'menu:testad', style: 'success' }],
  [{ t: '🔬  Research', c: 'menu:res' }, { t: '✍️  AI Copy', c: 'menu:copy' }, { t: '📦  Packages', c: 'menu:pkg' }],
  [{ t: '⚙️  More', c: 'menu:more' }]
]);

const MORE = kb([
  [{ t: '📋  Drafts', c: 'menu:drafts' }, { t: '🔔  Alerts', c: 'menu:alr' }],
  [{ t: '🏦  Accounts', c: 'menu:acc' }, { t: '🩺  Health', c: 'menu:health' }],
  [{ t: '📜  All 50+ features', c: 'feat:p:0' }, { t: 'ℹ️  About', c: 'menu:about' }],
  [{ t: '⬅️  Back to Home', c: 'menu:main' }]
]);

function toCsv(rows) {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head.join(','), ...rows.map(r => head.map(h => cell(r[h])).join(','))].join('\n');
}

/* ---------- FEATURE CATALOG (v6) — every real capability, one screen each ---------- */
const CATALOG = [
  { s: 'ads', i: '📊', n: 'My Ads live board', d: 'All ads with live status, balance bar, paging, refresh', cb: 'menu:ads' },
  { s: 'ads', i: '🔍', n: 'Ad detail deep-dive', d: 'Per-ad funnel (views-clicks-joins), spend, caps, targeting JSON' },
  { s: 'ads', i: '⏸️', n: 'Pause ad', d: 'Confirm-gated platform pause on any ad' },
  { s: 'ads', i: '▶️', n: 'Resume ad', d: 'Bring a paused/hold ad back live' },
  { s: 'ads', i: '🗑️', n: 'Delete ad', d: 'Remove + auto platform refund (cooldown-aware)' },
  { s: 'ads', i: '⚙️', n: 'Daily cap +1 TON', d: 'Raise a winning ad daily budget cap instantly' },
  { s: 'ads', i: '🧬', n: 'Clone ad to draft', d: 'Copy a live ad text into a fresh editable draft' },
  { s: 'ads', i: '🔥', n: 'Winners board', d: 'Active ads with JR >= 40% + one-tap cap push (fleet rule)', cb: 'ads:winners' },
  { s: 'ads', i: '↕️', n: 'Sort: cheapest joins', d: 'Board ordered by lowest cost-per-join first', cb: 'ads:sort:cpj' },
  { s: 'ads', i: '↕️', n: 'Sort: most joins', d: 'Board ordered by total joins', cb: 'ads:sort:joins' },
  { s: 'ads', i: '↕️', n: 'Sort: biggest spend', d: 'Board ordered by spend (find burners fast)', cb: 'ads:sort:spend' },
  { s: 'ads', i: '⏸️', n: 'Bulk pause all', d: 'One confirm - pause every active ad (stop-spend switch)', cb: 'ads:bulk:pause' },
  { s: 'ads', i: '▶️', n: 'Bulk resume', d: 'One confirm - resume every paused ad', cb: 'ads:bulk:resume' },
  { s: 'growth', i: '📦', n: 'Packages - client plans', d: 'Channel link - full client GROWTH PLAN .md: audit, competitors, targets, 30-day plan + pricing', cb: 'menu:pkg' },
  { s: 'growth', i: '🩺', n: 'Channel audit', d: 'Subs, avg views/post, view-rate from public t.me preview' },
  { s: 'growth', i: '🥊', n: 'Competitor scan', d: 'Ad-archive advertisers in the same niche (tgadsspy)' },
  { s: 'growth', i: '🌐', n: 'Language auto-detect', d: 'hi / ru / en / ar - plan renders in the channel language' },
  { s: 'growth', i: '🧠', n: 'Niche auto-detect', d: '8 buckets: binary, forex, crypto, betting, stocks, edu, movies, news' },
  { s: 'growth', i: '🎯', n: 'Proven target channels', d: 'Same-niche channels from our own live fleet winners' },
  { s: 'growth', i: '🧪', n: 'Test Ad funnel', d: '6 steps: tests - country - brief - link - research+budget - preview - LIVE', cb: 'menu:testad' },
  { s: 'growth', i: '🅰️', n: 'Multi-test A/B hooks', d: '1-3 tests, each a different creative angle (proof/urgency/beginner)' },
  { s: 'growth', i: '🌍', n: 'Geo picker', d: 'India-first default, UAE, agency-policy fallback' },
  { s: 'growth', i: '📝', n: 'Brief shaper', d: 'Raw prompt - 160-char platform-ready variants' },
  { s: 'growth', i: '💰', n: 'Budget guardrails', d: 'Min 1.8 TON floor, recommended 3 TON/day, custom with validation' },
  { s: 'growth', i: '👀', n: 'Full ad preview', d: 'Copy xN, targeting, CPM, budget - before any money moves' },
  { s: 'growth', i: '🚀', n: 'GO LIVE xN', d: 'Confirm - real platform creates with idempotency keys + audit' },
  { s: 'research', i: '🔬', n: 'Keyword search', d: 'Discover advertiser-active channels by niche keyword', cb: 'menu:res' },
  { s: 'research', i: '⚡', n: 'Quick niches', d: 'One-tap: trading, forex, crypto, marketing', cb: 'res:q:trading' },
  { s: 'research', i: '📄', n: 'Results pager', d: 'Browse results 6 per screen' },
  { s: 'research', i: '✅', n: 'Channel validation', d: 'Is a channel targetable on official ads? (size/link checks)' },
  { s: 'research', i: '💾', n: 'Save to list', d: 'Keep winners in named research lists' },
  { s: 'research', i: '📁', n: 'Saved lists', d: 'Your curated channel lists', cb: 'res:lists' },
  { s: 'research', i: '📤', n: 'Research CSV', d: 'Export list/rows as CSV document' },
  { s: 'content', i: '✍️', n: 'Copy Studio (AI)', d: 'Offer - 3 platform-ready variants, streaming live', cb: 'menu:copy' },
  { s: 'content', i: '⚡', n: 'Streaming output', d: 'Bot API 10.3 draft-streaming - text appears as it writes' },
  { s: 'content', i: '🛑', n: 'Stop generation', d: 'Stop button aborts mid-stream, finalizes safely' },
  { s: 'content', i: '🎭', n: 'Tone picker', d: 'Bold / friendly / pro tones' },
  { s: 'content', i: '🌐', n: 'Language picker', d: 'Ad copy in EN/HI/RU' },
  { s: 'content', i: '🔁', n: 'Regenerate', d: 'Fresh variants on demand' },
  { s: 'content', i: '🧬', n: 'AI to draft', d: 'Move chosen copy into Drafts for launch' },
  { s: 'content', i: '📋', n: 'Drafts', d: 'All saved ad drafts with status + targets', cb: 'menu:drafts' },
  { s: 'content', i: '🚀', n: 'Launch draft', d: 'Confirm - real ad create (budget-checked, audited)' },
  { s: 'content', i: '🗄️', n: 'Archive draft', d: 'Clean up without deleting history' },
  { s: 'content', i: '🧯', n: 'AI failover x6', d: 'Groq-NVIDIA-OpenRouter-Gemini-Mistral-Pollinations, circuit breaker' },
  { s: 'content', i: '💸', n: 'AI budget hard-stop', d: 'Per-user daily $ cap - no runaway spend' },
  { s: 'reports', i: '📈', n: 'Full .md report', d: 'Fleet summary + per-ad sections: budget, funnel, verdict, action', cb: 'menu:rep' },
  { s: 'reports', i: '🧾', n: 'Per-ad verdicts', d: 'Winner / healthy / weak / burning + recommended action each' },
  { s: 'reports', i: '🗓️', n: '7-day view', d: 'Weekly performance window', cb: 'rep:7' },
  { s: 'reports', i: '📤', n: 'CSV export', d: 'Spreadsheet of all ads for client reporting', cb: 'rep:csv:1' },
  { s: 'reports', i: '📸', n: 'Snapshot history', d: 'Every pull archived - period deltas between runs' },
  { s: 'accounts', i: '🏦', n: 'Accounts hub', d: 'All ads accounts, active marker, quick actions', cb: 'menu:acc' },
  { s: 'accounts', i: '➕', n: 'Add account', d: 'Paste token - LIVE-validated against the platform - saved', cb: 'acc:add' },
  { s: 'accounts', i: '🔀', n: 'Switch active account', d: 'Board/creates/reports all follow the active account' },
  { s: 'accounts', i: '💰', n: 'Per-account balance', d: 'One-tap balance refresh per account' },
  { s: 'accounts', i: '💎', n: 'All balances board', d: 'Every account balance in one screen', cb: 'acc:bals' },
  { s: 'accounts', i: '🗑️', n: 'Remove account', d: 'Safe detach (running ads unaffected, confirm-gated)' },
  { s: 'accounts', i: '🙈', n: 'Token masking', d: 'Tokens never echoed in chat - last 4 chars only' },
  { s: 'ops', i: '🔔', n: 'Alerts', d: 'Digest + low-balance alerts', cb: 'menu:alr' },
  { s: 'ops', i: '⚖️', n: 'Balance alerts', d: 'Ping at 5 / 10 TON remaining' },
  { s: 'ops', i: '🩺', n: 'Health screen', d: 'Providers, DB, scheduler, uptime at a glance', cb: 'menu:health' },
  { s: 'ops', i: '🧾', n: 'Audit log tail', d: 'Every consequential action recorded + viewable' },
  { s: 'ops', i: '🎬', n: 'Cinematic /start', d: 'Hero animation + tiered desk, text fallback' },
  { s: 'ops', i: 'ℹ️', n: 'About / capabilities', d: 'What this system is + data sources', cb: 'menu:about' },
  { s: 'ops', i: '⏰', n: '5-min scheduler', d: 'Auto-resume capped ads (3 TON/day fleet rule)' },
  { s: 'ops', i: '🛡️', n: 'Guards', d: 'Owner allowlist, rate limits, confirm TTLs, idempotency' },
  { s: 'ops', i: '❌', n: 'Unified /cancel', d: 'Closes ALL active workflows in one command' },
  { s: 'ops', i: '🌍', n: 'Public health endpoint', d: 'bot-production-c2eb.up.railway.app - branded JSON' }
];
const SECTION_META = {
  ads: { t: 'ADS MANAGER', i: '📊' }, growth: { t: 'GROWTH ENGINE', i: '🚀' },
  research: { t: 'RESEARCH', i: '🔬' }, content: { t: 'CONTENT & AI', i: '✍️' },
  reports: { t: 'REPORTS', i: '📈' }, accounts: { t: 'ACCOUNTS', i: '🏦' }, ops: { t: 'SYSTEM & OPS', i: '🩺' }
};
const catalogSection = sid => CATALOG.filter(f => f.s === sid).map((f, i) => ({ ...f, idx: CATALOG.indexOf(f) }));
const catalogPage = p => {
  const PER = 8;
  const pages = Math.max(1, Math.ceil(CATALOG.length / PER));
  const page = Math.max(0, Math.min(p | 0, pages - 1));
  return { items: CATALOG.slice(page * PER, page * PER + PER).map(f => ({ ...f, idx: CATALOG.indexOf(f) })), page, pages, total: CATALOG.length };
};
const feature = idx => (CATALOG[idx] != null ? { ...CATALOG[idx], idx } : null);

module.exports = { esc, BRAND, header, pill, PILL, bar, SPIN, spin, num, inr, ton, cemoji, hasCustom, adRow, adsBoard, budgetMeter, kb, pagerRows, MENU, MORE, toCsv, CATALOG, SECTION_META, catalogSection, catalogPage, feature };
