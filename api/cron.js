'use strict';
/* Scheduler tick endpoint — full scheduler.tick() run.
   Callers: Vercel Cron (daily backstop, x-vercel-cron header) and external
   pingers (GitHub Actions 5-min cron) passing ?key=<CRON_SECRET>. */
const { waitUntil } = require('@vercel/functions');
const scheduler = require('../src/scheduler');
const { log } = require('../src/log');

const CRON_SECRET = process.env.CRON_SECRET || '';
const logline = m => log.info(m);

module.exports = async (req, res) => {
  const key = (req.query && req.query.key) || '';
  const viaVercelCron = !!req.headers['x-vercel-cron'];
  if (!viaVercelCron && (!CRON_SECRET || key !== CRON_SECRET)) {
    res.statusCode = 401;
    return res.end('unauthorized');
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end('{"ok":true,"triggered":true}');

  waitUntil((async () => {
    try {
      await scheduler.tick(logline);
      log.info('cron tick complete');
    } catch (e) {
      log.error(`cron tick: ${e.stack || e.message}`);
    }
  })());
};
