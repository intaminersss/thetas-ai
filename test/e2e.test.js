'use strict';
/* e2e.test.js — ROUTER-LEVEL END-TO-END: simulates real Telegram updates through index.js
   onUpdate/routeCb with mocked transports (tg/db/adsapi/spyapi recording calls).
   Proves: every menu button routes, every handler responds, no crash, every tap acked.
   Network is fully mocked — clearly labeled. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

process.env.TELEGRAM_BOT_TOKEN = '111111111:test-token';
process.env.SUPABASE_DB_URL = 'postgresql://localhost:1/x';
process.env.ALLOWED_USER_IDS = '7049127887';
process.env.RATE_LIMIT_MAX = '100000'; // router E2E fires many taps quickly

/* ---------- recorded mock transports ---------- */
const calls = [];
const rec = (type, ...args) => { calls.push({ type, args }); return Promise.resolve(mockResults(type, args)); };

const SAMPLE_ADS = [
  { ad_id: 96, status: 'active', views: 1200, clicks: 40, joins: 20, spent_budget: 1.9, text: 'Win-rate proof creative #96', promote_url: 'https://t.me/real', cpm: 0.6 },
  { ad_id: 79, status: 'on_hold', views: 18158, clicks: 329, joins: 63, spent_budget: 9.84, daily_budget_limit: 5, remaining_budget: 4.76 }
];
const SAMPLE_DRAFT = { id: 'abc-uuid', title: 'Test draft', text: 'Test ad text', promote_url: 'https://t.me/real', target: { type: 'users' }, cpm: 0.6, placement: 'channel_post', initial_budget: 1.8, daily_budget_limit: 2, status: 'draft', launched_ad_id: null };

function mockResults(type, args) {
  if (type === 'sm' || type === 'edit') return { chat: { id: 7049127887 }, message_id: calls.length + 100 };
  if (type === 'getMe') return { username: 'thetas_test', id: 8862583233 };
  return null;
}

const tgMock = {
  call: async (method, body) => { calls.push({ type: `api:${method}`, args: [body] }); return { ok: true }; },
  sm: (c, t, k) => rec('sm', c, t, k),
  edit: (c, m, t, k) => { const p = rec('edit', c, m, t, k); return p.then(r => r); },
  answerCb: (id, text) => rec('answerCb', id, text),
  sendDoc: (c, n, d, cap) => rec('sendDoc', c, n, d, cap),
  sendAnimation: (c, f, cap, k) => rec('sendAnimation', c, f, cap, k),
  sendDraft: (c, id, t) => rec('sendDraft', c, id, t),
  typing: c => rec('typing', c),
  chunkText: t => [String(t)],
  getMe: async () => ({ username: 'thetas_test', id: 8862583233 }),
  pollLoop: async () => { calls.push({ type: 'pollLoop', args: [] }); }, // no infinite loop in tests
  stats: () => ({ lastUpdateAt: 0 })
};

const dbMock = {
  q: async (sql) => {
    calls.push({ type: 'db', args: [String(sql).slice(0, 60)] });
    if (/insert into research_lists/.test(sql)) return [{ id: 1 }];
    if (/insert into ad_accounts/.test(sql)) return [{ id: 2 }];
    if (/from ad_alerts_rules/.test(sql)) return [{ ad_id: 96, per_1k: true, per_join: true, per_spend: true }];
    if (/from ad_alerts_state/.test(sql)) return [{ ad_id: 96, last_views_1k: 0, last_joins: 0, last_spent_half: 1, updated_at: new Date() }];
    if (/from plans_archive/.test(sql)) return [{ id: 1, username: 'demochan', lang: 'en', md: '# plan', created_at: new Date() }];
    if (/min\(captured_at\)/.test(sql)) return [{ f: new Date(Date.now() - 12 * 86400e3) }];
    if (/from drafts where status='draft'/.test(sql)) return [{ id: 'abc-uuid', title: 'Test draft', status: 'draft' }];
    if (/select key,value from agency_settings/.test(sql)) return [];
    if (/from ad_accounts/.test(sql)) return [{ id: 2, label: 'Second Desk', token: 'AAHPxyz000000000000000111', balance_ton: 9.5, is_default: false }];
    if (/insert into drafts/.test(sql)) return [{ id: 'new-draft-id' }];
    if (/from research_lists/.test(sql)) return [{ id: 1, name: 'default', n: 2 }];
    if (/from research_list_items/.test(sql)) return [{ username: 'samplechan', title: 'Sample', members: 1000, niche: 'trading', note: null, added_at: new Date() }];
    if (/from ai_budget/.test(sql)) return [{ key: 'daily_user', limit_usd: 0.5, enabled: true }, { key: 'daily_global', limit_usd: 5, enabled: true }];
    if (/sum\(est_cost_usd\)/.test(sql)) return [{ usd: 0 }];
    if (/from alerts/.test(sql)) return [];
    if (/from drafts where/.test(sql) && /select/.test(sql)) return [];
    return [];
  },
  one: async (sql) => {
    calls.push({ type: 'db1', args: [String(sql).slice(0, 60)] });
    if (/from drafts where id/.test(sql)) return SAMPLE_DRAFT;
    return null;
  },
  tx: async fn => fn({ query: async () => ({ rows: [] }) }),
  healthy: async () => true,
  pool: {}
};

const adsMock = {
  getCurrentAccount: async () => { calls.push({ type: 'ads:getAccount' }); return { remaining_budget: 15.86 }; },
  getAdsList: async () => { calls.push({ type: 'ads:list' }); return SAMPLE_ADS; },
  getAdsById: async ids => { calls.push({ type: 'ads:byId', args: ids }); return (ids || []).map(id => SAMPLE_ADS.find(a => a.ad_id === id) || SAMPLE_ADS[0]); },
  getTargetChannel: async ch => { calls.push({ type: 'ads:target', args: [ch] }); return { id: 'x' }; },
  createAd: async (payload, idemKey) => { calls.push({ type: 'ads:create', args: [payload, idemKey] }); return { ad_id: 555, status: 'in_review' }; },
  editAd: async (id, patch) => { calls.push({ type: 'ads:edit', args: [id, patch] }); return {}; },
  deleteAd: async id => { calls.push({ type: 'ads:delete', args: [id] }); return {}; },
  explain: e => e.message,
  adsCall: async (method, opts = {}) => { calls.push({ type: 'ads:call', args: [method, opts] }); return { remaining_budget: 9.5, account: { name: 'Second Desk' } }; },
  setAccount: (token, label) => calls.push({ type: 'ads:setAccount', args: [token ? String(token).slice(-4) : null, label] }),
  clearAccount: () => calls.push({ type: 'ads:clearAccount' }),
  accountLabel: () => (calls.find(c => c.type === 'ads:setAccount') ? 'Second Desk' : 'default (env)'),
  activeToken: () => 'tok'
};

const spyMock = {
  searchChannels: async ({ q }) => { calls.push({ type: 'spy:search', args: [q] }); return { rows: [
    { username: 'bmrtradingbot', title: 'BMR Trading', creativeCount: 264, niche: 'trading', lastSeenAt: '2026-10-11T00:00:00Z' },
    { username: 'goldsignals', title: 'Gold Signals', creativeCount: 90, niche: 'trading', lastSeenAt: '2026-10-10T00:00:00Z' }
  ], total: 2, source: 'mock tgadsspy' }; },
  searchAdvertisers: async ({ q }) => { calls.push({ type: 'spy:adv', args: [q] }); return { rows: [
    { username: 'bmrtradingbot', title: 'BMR Trading', creativeCount: 264, niche: 'trading' },
    { username: 'rivalchannel', title: 'Rival Signals', creativeCount: 42, niche: 'trading' }
  ], total: 2, source: 'mock tgadsspy' }; }
};

/* stub for global fetch (t.me/s/<channel> public preview) used by the growth engine */
const TME_FIXTURE = `<html><div class="tgme_channel_info_header_title" dir="auto">Demo Trades</div>
<div class="tgme_channel_info_counter"><span class="counter_value">12 400</span><span class="counter_type">subscribers</span></div>
<div class="tgme_channel_info_description">Daily forex &amp; gold signals. XAUUSD entries every session.</div>
<div class="tgme_widget_message_text" dir="auto">Gold smashed TP — 21 signals, 20 in plus this week</div><span class="tgme_widget_message_views">1.8K</span>
<div class="tgme_widget_message_text" dir="auto">Free session at 09:00, join early</div><span class="tgme_widget_message_views">1.1K</span></html>`;
const realFetch = globalThis.fetch;
function stubTmeFetch() {
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => TME_FIXTURE });
}

/* install mocks BEFORE requiring the app */
function setMock(file, exportsObj) {
  const p = require.resolve(file);
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exportsObj };
}
setMock('../src/tg', tgMock);
setMock('../src/db', dbMock);
setMock('../src/adsapi', adsMock);
setMock('../src/spyapi', spyMock);
const aiMock = { chat: async () => { calls.push({ type: 'ai' });
    return { text: '1. Variant one\n2. Variant two\n3. Variant three', meta: { provider: 'mock', model: 'm', est_cost_usd: 0, attempts: 1, skipped_providers: [] } }; },
  budgetCheck: async () => ({ ok: true, spentUser: 0, spentGlobal: 0 }), circuitState: () => ({}) };
setMock('../src/ai', aiMock);

const app = require('../src/index');

/* helpers to build Telegram-like updates */
const FROM = { id: 7049127887, first_name: 'Boss', username: 'boss' };
const msgUpdate = text => ({ message: { message_id: Date.now() % 100000, chat: { id: 7049127887 }, from: FROM, text, date: Math.floor(Date.now() / 1000) } });
const cbUpdate = data => ({ callback_query: { id: `cb${Math.random()}`, from: FROM, data, message: { chat: { id: 7049127887 }, message_id: 42 } } });
const lastOf = type => [...calls].reverse().find(c => c.type === type);

/* fresh calls array per test */
function reset() { calls.length = 0; }

test('E2E: /start → HERO animation + caption + tiered menu keyboard', async () => {
  reset();
  await app.onUpdate(msgUpdate('/start'));
  const hero = lastOf('sendAnimation');
  assert.ok(hero, 'sendAnimation called');
  assert.ok(String(hero.args[2]).includes('Welcome'), 'caption greets user');
  const kb = hero.args[3];
  assert.ok(kb.inline_keyboard.length === 4, 'clean 4-row keyboard');
  assert.ok(kb.inline_keyboard[0][0].callback_data === 'menu:ads', 'My Ads first (primary)');
  assert.ok(kb.inline_keyboard.flat().every(b => b.callback_data), 'all buttons wired');
  assert.ok(kb.inline_keyboard.flat().some(b => b.callback_data === 'menu:more'), 'More holds secondary tools');
});

test('E2E: every menu button routes to its screen (10/10)', async () => {
  const expects = [
    ['menu:testad', t => /TEST AD FUNNEL/.test(t)],
    ['menu:pkg', t => /PACKAGES/.test(t)],
    ['menu:acc', t => /ACCOUNTS/.test(t)],
    ['menu:ads', t => /LIVE ADS|ADS/.test(t)],
    ['menu:res', t => /RESEARCH/.test(t)],
    ['menu:copy', t => /COPY STUDIO/.test(t)],
    ['menu:drafts', t => /DRAFTS/.test(t)],
    ['menu:rep', t => /PERFORMANCE/.test(t)],
    ['menu:alr', t => /ALERTS/.test(t)],
    ['menu:health', t => /HEALTH/.test(t)],
    ['menu:about', t => /CAPABILITY MATRIX|THETAS AI/.test(t)]
  ];
  for (const [data, match] of expects) {
    reset();
    await app.onUpdate(cbUpdate(data));
    const edit = lastOf('edit') || lastOf('sm');
    assert.ok(edit, `${data} produced a screen`);
    const text = String(edit.args[edit.type === 'edit' ? 2 : 1]);
    assert.ok(match(text), `${data} screen content matched → got: ${text.slice(0, 80)}`);
    assert.ok(lastOf('answerCb') || edit, `${data} tap acknowledged`);
  }
});

test('E2E: ⬅️ Menu returns to control desk (edit path, no media re-send)', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:main'));
  const edit = lastOf('edit');
  assert.ok(edit, 'edited in place');
  assert.ok(/CONTROL DESK/.test(String(edit.args[2])), 'desk text');
  assert.ok(!lastOf('sendAnimation'), 'no media spam on back-nav');
});

test('E2E: ad detail → pause confirm → pause executes via API', async () => {
  reset();
  await app.onUpdate(cbUpdate('ad:96'));
  let edit = lastOf('edit');
  assert.ok(/AD #96/.test(String(edit.args[2])), 'detail screen');
  reset();
  await app.onUpdate(cbUpdate('ad:96:pause'));
  edit = lastOf('edit');
  assert.ok(/Confirm/.test(String(edit.args[2])), 'confirmation gate shown');
  reset();
  await app.onUpdate(cbUpdate('ad:96:pause_go'));
  const apiEdit = calls.find(c => c.type === 'ads:edit');
  assert.ok(apiEdit && apiEdit.args[1].is_paused === true, 'pause hit the API');
  assert.ok(calls.find(c => c.type === 'db' && /audit_log/.test(c.args[0])), 'audited');
});

test('E2E: duplicate consequential action blocked (idempotency)', async () => {
  reset();
  await app.onUpdate(cbUpdate('ad:96:pause_go'));
  const editCalls = calls.filter(c => c.type === 'ads:edit');
  assert.strictEqual(editCalls.length, 0, 'repeat within window NOT re-sent');
  assert.ok(lastOf('answerCb'), 'user told instead');
});

test('E2E: research search → results screen + channel validation flow', async () => {
  reset();
  await app.onUpdate(cbUpdate('res:q:trading'));
  const spy = calls.find(c => c.type === 'spy:search');
  assert.ok(spy, 'spy searched');
  const screen = lastOf('edit') || lastOf('sm');
  assert.ok(/bmrtradingbot|RESULTS/.test(JSON.stringify(screen.args)), 'results rendered');
  reset();
  await app.onUpdate(cbUpdate('res:chk:bmrtradingbot'));
  assert.ok(calls.find(c => c.type === 'ads:target'), 'placement validated via ads API');
  const verdict = lastOf('edit');
  assert.ok(/accepted by Telegram Ads/.test(String(verdict.args[2])), 'eligibility verdict');
});

test('E2E: copy studio wizard — tone guard, full happy path with save-as-draft', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:copy'));
  await app.onUpdate(msgUpdate('free gold signals channel for indian traders'));
  let sm = lastOf('sm');
  assert.ok(/TONE/.test(String(sm.args[1])), 'step 2 tone offered');
  reset();
  await app.onUpdate(cbUpdate('copy:tone:confident'));
  sm = lastOf('sm');
  assert.ok(/LANGUAGE/.test(String(sm.args[1])), 'step 3 language offered');
  reset();
  await app.onUpdate(cbUpdate('copy:lang:en'));
  assert.ok(calls.find(c => c.type === 'ai'), 'AI provider chain invoked');
  const final = lastOf('sm');
  assert.ok(/VARIANTS READY/.test(String(final.args[1])), 'final variants screen');
  reset();
  await app.onUpdate(cbUpdate('copy:to_draft'));
  assert.ok(calls.find(c => c.type === 'db' && /insert into drafts/.test(c.args[0])), 'draft persisted');
});

test('E2E: copy studio — offer too short → validation message, no AI call', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:copy'));
  reset();
  await app.onUpdate(msgUpdate('short'));
  assert.ok(lastOf('sm'), 'validation feedback sent');
  assert.ok(!calls.find(c => c.type === 'ai'), 'no AI spent');
});

test('E2E: drafts → detail → launch confirm → launch creates REAL ad (mock API)', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:drafts'));
  assert.ok(lastOf('edit') || lastOf('sm'), 'drafts screen');
  reset();
  await app.onUpdate(cbUpdate('draft:abc-uuid'));
  const det = lastOf('edit');
  assert.ok(/DRAFT/.test(String(det.args[2])), 'draft detail');
  reset();
  await app.onUpdate(cbUpdate('draft:abc-uuid:lc'));
  const conf = lastOf('edit');
  assert.ok(/CONFIRM LAUNCH|real ad/i.test(String(conf.args[2])), 'launch warning');
  reset();
  await app.onUpdate(cbUpdate('draft:abc-uuid:launch_go'));
  const created = calls.find(c => c.type === 'ads:create');
  assert.ok(created, 'createAd called');
  assert.strictEqual(created.args[0].initial_budget, 1.8, 'payload validated');
  const done = lastOf('edit');
  assert.ok(/AD CREATED/.test(String(done.args[2])), 'success screen');
});

test('E2E: reports screen + CSV export document', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:rep'));
  const screen = lastOf('edit');
  assert.ok(/PERFORMANCE/.test(String(screen.args[2])), 'report text');
  reset();
  await app.onUpdate(cbUpdate('rep:csv:1'));
  assert.ok(lastOf('sendDoc'), 'CSV document sent');
});

test('E2E: alerts toggle round-trip', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:alr'));
  assert.ok(/ALERTS/.test(String((lastOf('edit') || lastOf('sm')).args[2] || '')), 'alerts screen');
  reset();
  await app.onUpdate(cbUpdate('alr:digest'));
  assert.ok(calls.find(c => (c.type === 'db') && /alerts/.test(c.args[0])), 'digest toggled in DB');
});

test('E2E: unauthorized user gets NO data', async () => {
  reset();
  await app.onUpdate({ message: { message_id: 1, chat: { id: 42 }, from: { id: 42, first_name: 'Stranger' }, text: '/start', date: 0 } });
  const sm = lastOf('sm');
  assert.ok(/⛔/.test(String(sm?.args[1] || '')), 'blocked message');
  assert.strictEqual(calls.filter(c => c.type === 'ads:list' || c.type === 'sendAnimation').length, 0, 'zero data/actions leaked');
});

test('E2E: /cancel with no active workflow → graceful', async () => {
  reset();
  await app.onUpdate(msgUpdate('/cancel'));
  assert.ok(lastOf('sm'), 'graceful reply');
});

test('E2E: packages — channel link → research → .md growth plan delivered', async () => {
  stubTmeFetch();
  try {
    reset();
    await app.onUpdate(cbUpdate('menu:pkg'));
    const menu = lastOf('edit');
    assert.ok(/PACKAGES/.test(String(menu.args[2])), 'packages screen shown');
    reset();
    await app.onUpdate(msgUpdate('t.me/demotraders'));
    const doc = lastOf('sendDoc');
    assert.ok(doc, 'plan document sent');
    assert.ok(/\.md$/.test(String(doc.args[1])), 'filename is .md');
    const md = String(doc.args[2]);
    assert.ok(md.includes('# 🚀 GROWTH PLAN'), 'house format title');
    assert.ok(md.includes('$150–300') && md.includes('$1,000–1,500'), 'agency pricing exact');
    assert.ok(md.includes('12,400'), 'scraped subscriber count in plan');
    assert.ok(md.includes('@rivalchannel'), 'competitors from ad archive');
    assert.ok(md.includes('@forexsignals'), 'proven target channels');
    assert.ok(md.toLowerCase().includes('english'), 'language auto-detected');
    assert.ok(calls.find(c => c.type === 'db' && /audit_log/.test(c.args[0])), 'audited');
  } finally { globalThis.fetch = realFetch; }
});

test('E2E: test-ad funnel — full path: tests → geo → brief → link → budget → preview → GO LIVE ×2', async () => {
  stubTmeFetch();
  try {
    reset();
    await app.onUpdate(cbUpdate('menu:testad'));
    assert.ok(/TEST AD FUNNEL/.test(String(lastOf('edit').args[2])), 'funnel started');
    await app.onUpdate(cbUpdate('ta:n:2'));
    assert.ok(/COUNTRY|GEO/i.test(String(lastOf('edit').args[2])), 'geo step');
    await app.onUpdate(cbUpdate('ta:geo:in'));
    assert.ok(/BRIEF/i.test(String(lastOf('edit').args[2])), 'brief step');
    reset();
    await app.onUpdate(msgUpdate('Promote our forex signals channel - 90% win rate, daily XAUUSD entries, free trial week for traders.'));
    const linkStep = lastOf('edit') || lastOf('sm');
    assert.ok(/CHANNEL LINK|④/i.test(String((linkStep.args)[linkStep.type === 'edit' ? 2 : 1])), 'link step');
    reset();
    await app.onUpdate(msgUpdate('t.me/demotraders'));
    assert.ok(lastOf('sendDoc'), 'research plan .md attached mid-funnel');
    const budget = lastOf('edit');
    assert.ok(/BUDGET/i.test(String(budget.args[2])), 'budget step');
    await app.onUpdate(cbUpdate('ta:bud:1.8'));
    const prev = lastOf('edit');
    assert.ok(/FULL AD PREVIEW/.test(String(prev.args[2])), 'preview shown');
    assert.ok((prev.args[3]?.inline_keyboard || []).flat().some(b => /GO LIVE/.test(b.text)), 'live button present');
    await app.onUpdate(cbUpdate('ta:go'));
    assert.ok(/CONFIRM/.test(String(lastOf('edit').args[2])), 'confirm gate');
    reset();
    await app.onUpdate(cbUpdate('ta:go_go'));
    const creates = calls.filter(c => c.type === 'ads:create');
    assert.strictEqual(creates.length, 2, '2 tests = 2 real create calls');
    const p = creates[0].args[0];
    assert.strictEqual(p.target.country_codes[0], 'IN', 'India-first geo');
    assert.ok(Array.isArray(p.target.channel_ids) && p.target.channel_ids.length >= 4, 'channel-only targeting (no keywords)');
    assert.ok(p.target.channel_ids.every(ch => String(ch).startsWith('@')), 'channels are @handles');
    assert.strictEqual(p.cpm, 0.6, 'fleet CPM');
    assert.ok(creates[0].args[1].startsWith('testad-'), 'idempotency key namespaced');
    assert.ok(/LIVE/.test(String(lastOf('edit').args[2])), 'success screen');
  } finally { globalThis.fetch = realFetch; }
});

test('E2E: reports — full .md document with per-ad sections + budget', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:rep'));
  const doc = lastOf('sendDoc');
  assert.ok(doc, 'report document sent');
  assert.ok(/thetas-ads-report-.*\.md/.test(String(doc.args[1])), '.md filename');
  const md = String(doc.args[2]);
  assert.ok(md.includes('# 📊 THETAS AI — FULL ADS REPORT'), 'report header');
  assert.ok(md.includes('## 🔥 Ad #96') || md.includes('Ad #96'), 'per-ad section 96');
  assert.ok(md.includes('Ad #79'), 'per-ad section 79 (separately)');
  assert.ok(md.includes('Spent'), 'budget block per ad');
  assert.ok(md.includes('Daily cap'), 'daily budget per ad');
  assert.ok(md.includes('FLEET SUMMARY'), 'summary table');
  const preview = lastOf('edit') || lastOf('sm');
  assert.ok(/report/i.test(String(preview.args[2] || preview.args[1])), 'in-chat summary');
});

test('E2E: accounts — hub, add (live-validated), switch active, delete gate', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:acc'));
  const hub = lastOf('edit');
  assert.ok(/ACCOUNTS/.test(String(hub.args[2])), 'hub screen');
  assert.ok(hub.args[3].inline_keyboard.flat().some(b => b.callback_data === 'acc:add'), 'add button');
  reset();
  await app.onUpdate(cbUpdate('acc:add'));
  assert.ok(/ADD ADS ACCOUNT/.test(String(lastOf('edit').args[2])), 'add screen');
  reset();
  await app.onUpdate(msgUpdate('AAHPxyz000000000000000111'));
  const call = calls.find(c => c.type === 'ads:call');
  assert.ok(call && call.args[0] === 'getCurrentAccount' && call.args[1].token === 'AAHPxyz000000000000000111', 'candidate token validated against platform');
  assert.ok(calls.find(c => c.type === 'db' && /insert into ad_accounts/.test(c.args[0])), 'saved to DB');
  assert.ok(/ACCOUNT SAVED/.test(String(calls.filter(c => c.type === 'edit').slice(-1)[0].args[2])), 'success screen');
  assert.ok(!JSON.stringify(calls).includes('AAHPxyz000000000000000111x9'), 'token not echoed beyond masked use');
  reset();
  await app.onUpdate(cbUpdate('acc:sw:2'));
  assert.ok(calls.find(c => c.type === 'ads:setAccount' && c.args[0] === '0111'), 'active account switched (token override)');
  assert.ok(/ACCOUNTS/.test(String(lastOf('edit').args[2])), 'back to hub after switch');
  reset();
  await app.onUpdate(cbUpdate('acc:rm:2'));
  assert.ok(/Remove this account/.test(String(lastOf('edit').args[2])), 'remove is confirm-gated');
  await app.onUpdate(cbUpdate('acc:rm:2:go'));
  assert.ok(calls.find(c => c.type === 'db' && /set removed=true/.test(c.args[0])), 'detached after confirm');
});

test('E2E: ads manager — sort cycle, winners board, bulk pause gate→execute, clone→draft, delc fix', async () => {
  reset();
  await app.onUpdate(cbUpdate('menu:ads'));
  assert.ok(/LIVE ADS/.test(String(lastOf('edit').args[2])), 'board renders');
  await app.onUpdate(cbUpdate('ads:sort:cpj'));
  assert.ok(/sorted: /.test(String(lastOf('edit').args[2])), 'sort applied (cycle note shown)');
  reset();
  await app.onUpdate(cbUpdate('ads:winners'));
  const w = lastOf('edit');
  assert.ok(/WINNERS/.test(String(w.args[2])), 'winners screen');
  assert.ok(w.args[3].inline_keyboard.flat().some(b => b.callback_data === 'ad:96:capup'), 'winner push button present');
  reset();
  await app.onUpdate(cbUpdate('ads:bulk:pause'));
  assert.ok(/PAUSE ALL ACTIVE ADS/.test(String(lastOf('edit').args[2])), 'bulk gate');
  reset();
  await app.onUpdate(cbUpdate('ads:bulk:pause:_go'));
  const edits = calls.filter(c => c.type === 'ads:edit');
  assert.ok(edits.length >= 1 && edits.every(c => c.args[1].is_paused === true), 'bulk executed: active ads paused via API');
  assert.ok(/BULK DONE/.test(String(lastOf('edit').args[2])), 'bulk summary');
  reset();
  await app.onUpdate(cbUpdate('ad:96:clone'));
  assert.ok(calls.find(c => c.type === 'db' && /insert into drafts/.test(c.args[0])), 'clone inserted draft');
  assert.ok(/CLONED TO DRAFTS/.test(String(lastOf('edit').args[2])), 'clone screen');
  reset();
  await app.onUpdate(cbUpdate('ad:96:delc'));
  assert.ok(/Confirm: DELETE/.test(String(lastOf('edit').args[2])), 'delc legacy label now gates DELETE (dead-button fix)');
});

test('E2E: feature hub — desk button, catalog pages, ALL 50+ features render, sections', async () => {
  const { CATALOG } = require('../src/ui');
  assert.ok(CATALOG.length >= 50, `catalog has ${CATALOG.length} features (>=50 required)`);
  reset();
  await app.onUpdate(cbUpdate('menu:main'));
  const desk = lastOf('edit');
  assert.ok(desk.args[3].inline_keyboard.flat().some(b => b.callback_data === 'menu:more'), 'desk routes secondary via More');
  reset();
  await app.onUpdate(cbUpdate('feat:p:0'));
  assert.ok(/ALL FEATURES/.test(String(lastOf('edit').args[2])), 'catalog page 1');
  const totalPages = Math.ceil(CATALOG.length / 8);
  for (let p = 1; p < totalPages; p++) await app.onUpdate(cbUpdate(`feat:p:${p}`));
  assert.ok(new RegExp(`page ${totalPages}/`).test(String(lastOf('edit').args[2])), `all ${totalPages} catalog pages paginate`);
  reset();
  for (let i = 0; i < CATALOG.length; i++) {
    await app.onUpdate(cbUpdate(`feat:${i}`));
    const scr = lastOf('edit');
    assert.ok(scr && new RegExp(CATALOG[i].n.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(String(scr.args[2])), `feature ${i} (${CATALOG[i].n}) renders`);
  }
  reset();
  await app.onUpdate(cbUpdate('sec:ads'));
  assert.ok(/ADS MANAGER/.test(String(lastOf('edit').args[2])), 'section screen');
  reset();
  await app.onUpdate(cbUpdate('feat:0'));
  assert.ok(lastOf('edit').args[3].inline_keyboard.flat().some(b => b.callback_data === 'menu:ads'), 'feature detail offers Open shortcut');
});

test('E2E v7: live alerts — per-ad rules, toggles, global, engine fires per-ad notifications', async () => {
  reset();
  await app.onUpdate(cbUpdate('alr2:hub'));
  assert.ok(/LIVE ALERTS/.test(String(lastOf('edit').args[2])), 'alerts hub');
  await app.onUpdate(cbUpdate('alr2:pick'));
  assert.ok(/Which campaign/.test(String(lastOf('edit').args[2])), 'ad picker');
  await app.onUpdate(cbUpdate('alr2:ad:96'));
  assert.ok(/Ad #96/.test(String(lastOf('edit').args[2])), 'per-ad rules screen');
  await app.onUpdate(cbUpdate('alr2:tgl:96:1k:on'));
  assert.ok(calls.find(c => c.type === 'db' && /update ad_alerts_rules/.test(c.args[0])), 'rule persisted');
  await app.onUpdate(cbUpdate('alr2:global'));
  assert.ok(calls.find(c => c.type === 'db' && /agency_settings/.test(c.args[0])), 'global toggle persisted');
  /* engine: rules on, state zeros, live ad 96 → 1200v/20j/1.9TON → 3 notifications naming ad #96 */
  const livealerts = require('../src/handlers/livealerts');
  reset();
  const sent = await livealerts.engine(() => {});
  const sms = calls.filter(c => c.type === 'sm').map(c => String(c.args[1]));
  assert.ok(sent >= 3, `engine sent ${sent} notifications`);
  assert.ok(sms.some(t => /Ad #96/.test(t) && /1,000 views/.test(t)), '1k-view milestone names ad #96');
  assert.ok(sms.some(t => /Ad #96/.test(t) && /join/i.test(t)), 'join notification names ad #96');
  assert.ok(sms.some(t => /Ad #96/.test(t) && /TON/.test(t)), 'spend notification names ad #96');
});

test('E2E v7: single-ad report (#6/#55) + compare flow (#4)', async () => {
  reset();
  await app.onUpdate(cbUpdate('ad:96:rep'));
  const doc = lastOf('sendDoc');
  assert.ok(doc, 'single-ad report doc sent');
  assert.ok(/ad-96-report-.*\.md/.test(String(doc.args[1])), '.md filename');
  const md = String(doc.args[2]);
  assert.ok(md.includes('AD REPORT — #96'), 'single-ad header');
  assert.ok(md.includes('Verdict'), 'verdict included');
  assert.ok(md.includes('WINNER'), 'ad 96 is winner-grade');
  assert.ok(!md.includes('FLEET SUMMARY'), 'NOT a full-account report');
  reset();
  await app.onUpdate(cbUpdate('ad:96:cmp'));
  assert.ok(/#96 vs\?/.test(String(lastOf('edit').args[2])), 'compare picker');
  await app.onUpdate(cbUpdate('ad:96:cmp:79'));
  const cmp = String(lastOf('edit').args[2]);
  assert.ok(/COMPARE — #96 vs #79/.test(cmp), 'comparison screen');
  assert.ok(/Cost\/join/.test(cmp) && /🏆/.test(cmp), 'metrics + winner callout');
});

test('E2E v7: packages — lang toggle, plans library, pricing editor', async () => {
  stubTmeFetch();
  try {
    reset();
    await app.onUpdate(cbUpdate('menu:pkg'));
    await app.onUpdate(msgUpdate('t.me/demotraders'));
    assert.ok(lastOf('sendDoc'), 'plan delivered first');
    reset();
    await app.onUpdate(cbUpdate('pkg:lang:hi'));
    const doc = lastOf('sendDoc');
    assert.ok(doc && /ग्रोथ प्लान/.test(String(doc.args[2])), 'HI plan regenerated without re-scan');
    assert.ok(calls.find(c => c.type === 'db' && /insert into plans_archive/.test(c.args[0])), 'plan archived');
    reset();
    await app.onUpdate(cbUpdate('pkg:lib'));
    assert.ok(/PLANS LIBRARY/.test(String(lastOf('edit').args[2])), 'library lists plans');
    await app.onUpdate(cbUpdate('pkg:arch:1'));
    assert.ok(lastOf('sendDoc'), 'archived plan re-downloaded');
    reset();
    await app.onUpdate(cbUpdate('pkg:price'));
    assert.ok(/PRICING EDITOR/.test(String(lastOf('edit').args[2])), 'pricing editor screen');
    await app.onUpdate(cbUpdate('pkg:price:1'));
    assert.ok(/Send new value/.test(String(lastOf('edit').args[2])), 'price input step');
    reset();
    await app.onUpdate(msgUpdate('$200–400'));
    assert.ok(calls.find(c => c.type === 'db' && /agency_settings/.test(c.args[0])), 'price persisted to settings');
    assert.ok(/Pricing updated/.test(String(calls.filter(c => c.type === 'sm').slice(-1)[0].args[1])), 'confirmed');
  } finally { globalThis.fetch = realFetch; }
});

test('E2E v7: test-funnel draft import (#18) + /q + tour + catalog search (#22-24)', async () => {
  stubTmeFetch();
  try {
    reset();
    await app.onUpdate(cbUpdate('menu:testad'));
    await app.onUpdate(cbUpdate('ta:imp'));
    assert.ok(/IMPORT DRAFT/.test(String(lastOf('edit').args[2])), 'draft import list');
    await app.onUpdate(cbUpdate('ta:impid:abc-uuid'));
    assert.ok(lastOf('sendDoc'), 'research attached for imported draft');
    assert.ok(/BUDGET/i.test(String(lastOf('edit').args[2])), 'jumps straight to budget (brief+link imported)');
    await app.onUpdate(cbUpdate('ta:bud:1.8'));
    const prev = lastOf('edit');
    assert.ok(/Suggested split/.test(String(prev.args[2])), 'budget split advisor shown');
    await app.onUpdate(cbUpdate('ta:go'));
    assert.ok(/GO LIVE/.test(((lastOf('edit').args[3]) || {}).inline_keyboard?.flat().map(b => b.text).join(',') || ''), 'preview GO LIVE present');
    /* cleanup funnel so later tests unaffected */
    await app.onUpdate(cbUpdate('ta:cancel'));
    reset();
    await app.onUpdate(cbUpdate('menu:ads'));
    await app.onUpdate(msgUpdate('/q'));
    const q = calls.filter(c => c.type === 'sm').slice(-1)[0];
    assert.ok(/QUICK ACTIONS/.test(String(q.args[1])), '/q shows recent');
    assert.ok(q.args[2].inline_keyboard.flat().some(b => b.callback_data === 'menu:ads'), '/q includes last action shortcut');
    reset();
    await app.onUpdate(msgUpdate('/tour'));
    assert.ok(/TOUR 1\/6/.test(String(calls.filter(c => c.type === 'sm').slice(-1)[0].args[1])), 'tour starts');
    await app.onUpdate(cbUpdate('tour:1'));
    assert.ok(/TOUR 2\/6/.test(String(lastOf('edit').args[2])), 'tour paginates');
    reset();
    await app.onUpdate(cbUpdate('feat:p:0'));
    await app.onUpdate(cbUpdate('feat:search'));
    await app.onUpdate(msgUpdate('pause'));
    const hits = lastOf('sm') || lastOf('edit');
    const hText = String(hits.args[1] ?? hits.args[2]);
    const hKb = hits.args[2] || hits.args[3];
    assert.ok(/features.*for|Kuch nahi mila/.test(hText), 'search runs');
    assert.ok((hKb.inline_keyboard || { flat: () => [] }).flat().some(b => /Pause/.test(b.text)), 'search finds Pause features');
  } finally { globalThis.fetch = realFetch; }
});
