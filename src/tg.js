'use strict';
/* Minimal Telegram Bot API client — long-polling ONLY (webhook forbidden by spec).
   v3 hardening: Retry-After-aware bounded retries with jitter, typing indicator,
   4096-char safe sends, edit-in-place helpers. Verified against Bot API 10.3 docs. */
const { config, redact } = require('./config');
const { log } = require('./log');

const API = `https://api.telegram.org/bot${config.BOT_TOKEN}`;
let offset = 0;
let lastUpdateAt = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = ms => ms + Math.floor(Math.random() * Math.min(400, ms)); // bounded jitter (spec §13)

/* Is this Telegram error retryable, and after how long? */
function retryPlan(err) {
  const m = /retry after (\d+)/i.exec(err.message);
  if (m) return { retry: true, after: Number(m[1]) * 1000 };        // 429 with retry_after
  if (/429|too many/i.test(err.message)) return { retry: true, after: 2000 };
  if (/timeout|aborted|ECONN|socket|network|5\d\d/i.test(err.message)) return { retry: true, after: 1500 };
  if (/terminated by other getUpdates/i.test(err.message)) return { retry: false }; // pollLoop handles
  return { retry: false };
}

async function call(method, body = {}, timeoutSec = 0, attempt = 1) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Math.max(10, timeoutSec + 10) * 1000);
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timeoutSec ? { ...body, timeout: timeoutSec } : body),
      signal: ctl.signal
    });
    const j = await res.json().catch(() => ({ ok: false, description: `bad-json HTTP ${res.status}` }));
    if (!j.ok) {
      const e = new Error(redact(j.description || `HTTP ${res.status}`));
      e.code = j.error_code;
      const plan = retryPlan(e);
      if (plan.retry && attempt <= 2) {           // bounded: max 2 retries (no infinite loops)
        await sleep(jitter(plan.after * attempt));
        return call(method, body, timeoutSec, attempt + 1);
      }
      throw e;
    }
    return j.result;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('request timeout');
      const plan = retryPlan(err.message);
      if (plan.retry && attempt <= 2) { await sleep(jitter(plan.after)); return call(method, body, timeoutSec, attempt + 1); }
      throw err;
    }
    throw e;
  } finally { clearTimeout(t); }
}

const MAX_TEXT = 4096; // Bot API 10.3: 0-4096 characters after entity parsing (official limit)
function chunkText(text) {
  const s = String(text || '');
  if (s.length <= MAX_TEXT) return [s];
  const out = [];
  for (let i = 0; i < s.length; i += MAX_TEXT) out.push(s.slice(i, i + MAX_TEXT));
  return out;
}

const sm = async (chatId, text, kb) => {
  const parts = chunkText(text);
  let last;
  for (let i = 0; i < parts.length; i++) {
    last = await call('sendMessage', {
      chat_id: chatId, text: parts[i], parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(kb && i === parts.length - 1 ? { reply_markup: kb } : {})
    }).catch(e => { throw e; });
  }
  return last;
};

const edit = (chatId, msgId, text, kb) => call('editMessageText', {
  chat_id: chatId, message_id: msgId, text: String(text).slice(0, MAX_TEXT), parse_mode: 'HTML',
  link_preview_options: { is_disabled: true },
  ...(kb ? { reply_markup: kb } : {})
}).catch(e => (/not modified/.test(e.message) ? null : Promise.reject(e)));

const answerCb = (id, text) => call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) }).catch(() => {});

/* v7.2.1: sendDocument via multipart — the old JSON-body version serialized the Buffer
   into {"type":"Buffer",...}, Telegram read it as a URL string → "invalid file HTTP
   URL specified" on every report/CSV send. Same pattern as sendAnimation. */
async function sendDoc(chatId, filename, content, caption) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('document', new Blob([Buffer.from(String(content), 'utf8')]), filename);
  if (caption) {
    fd.append('caption', String(caption).slice(0, 1024));
    fd.append('parse_mode', 'HTML');
  }
  const res = await fetch(`${API}/sendDocument`, { method: 'POST', body: fd });
  const j = await res.json().catch(() => ({ ok: false, description: `bad-json HTTP ${res.status}` }));
  if (!j.ok) throw new Error(redact(j.description || `HTTP ${res.status}`));
  return j.result;
}

/* typing indicator — honest "working" feedback (skill: dynamic feedback layer) */
const typing = chatId => call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

/* sendAnimation — multipart upload (real file path) */
async function sendAnimation(chatId, filePath, caption, kb) {
  const fs = require('fs');
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  if (caption) fd.append('caption', String(caption).slice(0, 1024)); // official caption limit for media
  fd.append('parse_mode', 'HTML'); // v7.1 fix: welcome caption rendered as HTML, not raw tags
  if (kb) fd.append('reply_markup', JSON.stringify(kb));
  fd.append('animation', new Blob([buf], { type: 'image/gif' }), filePath.split('/').pop());
  const res = await fetch(`${API}/sendAnimation`, { method: 'POST', body: fd });
  const j = await res.json().catch(() => ({ ok: false, description: 'bad-json' }));
  if (!j.ok) throw new Error(redact(j.description || `HTTP ${res.status}`));
  return j.result;
}

/* sendMessageDraft — Bot API 10.3 verified: stream partial AI output (ephemeral 30s preview).
   draft_id: stable non-zero int → Telegram animates diffs. text empty => "Thinking…". */
const sendDraft = (chatId, draftId, text, { canStop = true } = {}) => call('sendMessageDraft', {
  chat_id: chatId, draft_id: draftId, text, parse_mode: 'HTML',
  ...(canStop ? { can_stop: true, keep_on_stop: false } : {})
}).catch(e => { log.warn(`draft: ${e.message}`); }); // drafts are cosmetic — never break generation

const getMe = () => call('getMe');

/** Long-poll loop. onUpdate(upd) should never throw. */
async function pollLoop(onUpdate, logLine) {
  const me = await getMe();
  logLine(`polling live as @${me.username} (id ${me.id}) — webhook mode disabled by config`);
  for (;;) {
    try {
      const ups = await call('getUpdates', {
        offset, timeout: 30,
        allowed_updates: ['message', 'callback_query', 'stopped_message_generation']
      }, 35);
      for (const u of ups || []) {
        offset = u.update_id + 1;
        lastUpdateAt = Date.now();
        try { await onUpdate(u); }
        catch (e) { log.error(`handler error: ${e.message}`); }
      }
    } catch (e) {
      log.error(`poll error: ${e.message} — retry in 5s`);
      await sleep(5000);
    }
  }
}

module.exports = { call, sm, edit, answerCb, sendDoc, sendAnimation, sendDraft, typing, chunkText, getMe, pollLoop, stats: () => ({ lastUpdateAt }) };
