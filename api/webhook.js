'use strict';
/* Vercel serverless entry — Telegram webhook → shared onUpdate router (src/index.js).
   Responds 200 immediately; processing continues via waitUntil (60s budget).
   Auth: X-Telegram-Bot-Api-Secret-Token must match TELEGRAM_WEBHOOK_SECRET. */
const { waitUntil } = require('@vercel/functions');
const { onUpdate } = require('../src/index');
const scheduler = require('../src/scheduler');
const { log } = require('../src/log');

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const logline = m => log.info(m);

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      product: 'THETAS AI',
      mode: 'webhook-serverless',
      built_by: '@TelesAds (Telesads.com)'
    }));
  }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('method not allowed'); }
  if (SECRET && req.headers['x-telegram-bot-api-secret-token'] !== SECRET) {
    res.statusCode = 401;
    return res.end('unauthorized');
  }

  let update = req.body;
  if (typeof update === 'string') {
    try { update = JSON.parse(update); } catch { res.statusCode = 400; return res.end('bad json'); }
  }

  /* Ack first — Telegram retries non-2xx webhooks, which would double-process. */
  res.statusCode = 200;
  res.end('{"ok":true}');

  waitUntil((async () => {
    try {
      if (update && update.update_id !== undefined) await onUpdate(update);
    } catch (e) {
      log.error(`webhook onUpdate: ${e.stack || e.message}`);
    }
    try { await scheduler.maybeTick(logline); } catch (e) { log.error(`maybeTick: ${e.message}`); }
  })());
};
