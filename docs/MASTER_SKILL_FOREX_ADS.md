# MASTER SKILL — Forex Telegram Ads TON Manager (standing instruction)
**Installed:** Oct 18, 2026 · **Owner order:** apply on every message · **Status: Phase 1 complete (audit + verification)**

---

## 0. Standing Rules (apply every message)

1. Forex Trading = primary niche. Classify channels by REAL content — crypto/binary/general-finance ≠ forex.
2. Approved countries (15, fixed — changes need owner approval):
   SA · SG · UK · AU · KR · IT · ID · DE · PL · CA · NL · AT · BE · ES · PT
3. **Never ban/exclude a country permanently** (owner order Oct 18). Fraud/loser results = campaign-craft problem → rebuild creative/targeting approach and retest with smaller budgets.
4. Fraud-detection stays ON (CTR >10% flag, >20% auto-pause candidate; joins/clicks sanity) — it protects budget, it does not ban geos.
5. READ-ONLY by default. Owner approval required for: launching/modifying live campaigns, bids/budgets, pausing/deleting, spending, credentials.
6. Evidence-based only: never fabricate audience locations, subscriber quality, stats, or costs. Label estimates vs verified. Minimum sample size before winners: ~500 views AND ~10 clicks per cell.
7. Report ACTUAL channel members as primary KPI; bot-joins secondary (measured funnel ratio ≈ 39%).
8. Metrics (verified data only): CPM=(spend/impressions)×1000 · CPC=spend/attributed clicks · CPS=spend/attributed subscribers · CTR=clicks/impressions×100.
9. No guaranteed-CPC/CPM promises. Low bid ≠ low CPS (may cut delivery). Attribute with care; delayed conversions happen.
10. Failed tests are recorded — never re-recommend without a new hypothesis.

## 1. Repository Verification Report (Phase 1, verified Oct 18 via GitHub API)

| Repo | Exists | License | Lang | Last push | Verdict |
|---|---|---|---|---|---|
| NikitaZhidkov/tg-ads-mcp | ✅ | MIT | Python | 2026-07 | **ADMIT (reference/adapter)** — MCP server, 50 tools for Telegram Ads (TON/EUR). Needs MCP host runtime; we mirror its tool-contract in our own adapter. |
| rshushin/Telegram-Ads-CPM | ✅ | MIT | Python | 2025-08 | **ADMIT (formula reference)** — recommended-CPM math; port logic, don't vendor code. |
| ivanl2000/tgstat-opensource | ✅ | ❌ NONE | Python | 2026-08 | **BLOCKED (license)** — no reuse of code. Methodology reading only. |
| Neurounit-base/telegram-ads-claude | ✅ | ❌ NONE | TS | 2026-07 | **BLOCKED (license)** — skills methodology reference only. |
| Exey/tg-channel-stats | ❌ missing | — | — | — | **DEAD candidate** — dropped. |
| mbfinotti/advertising-skills | ✅ | MIT | Python | 2026-09 | **ADMIT (skill content)** — paid-media skills (channel selection, budgets, audiences, creative, measurement) — MIT allows adoption with attribution. |

## 2. Niche Classification (Forex scoring rules)

Relevance score 0–100 (higher = better target):
- +40 genuine forex content (pairs, FX analysis, MT4/MT5, forex education)
- +20 active audience (median views/subscribers ≥ 10% on last 20 posts, when data available)
- +15 posting frequency ≥ 3/week
- +10 trading-education angle (matches our free-course offer)
- +10 engagement sanity (no view-pattern anomalies)
- −50 binary-options/gambling tilt, −40 fake-engagement flags, −30 misleading ROI claims, −100 P2P-only
Confidence tag on every score: VERIFIED (own data) / ESTIMATED (third-party) / UNKNOWN.

## 3. Targeting Chooser — ranking model

Score = 0.35×(forex-audience relevance) + 0.20×(channel quality) + 0.20×(actual CPS, inverse) + 0.10×(attributed conversions) + 0.10×(delivery confidence) + 0.05×(budget efficiency).
Hard outputs per country: audience indicators, channel categories, language signals, historical CPM/CPC/CPS, conversions, competition evidence, freshness+confidence, recommended TEST budget, select/reject reason. Insufficient data ⇒ label EXPERIMENTAL + controlled test proposal (never invent figures).

## 4. Testing Strategy (live campaigns)

Small approved budget per test · one variable at a time · pre-declared success criteria · equal-period comparisons · pause at risk limits · scale winners gradually with evidence · failed-test log kept.

## 5. Implementation Status (honest)

**IMPLEMENTED:** repo verification (this doc) · metrics formulas · classification/scoring rules · targeting-chooser model spec · fraud-detection heuristics (live, manual) · 15-country framework · testing strategy · safety rules.
**PARTIAL:** analytics dashboard (API polling + Supabase snapshots exist in project; dashboard/report layer manual) · CPM/CPC optimizer (formulas live; auto-bid-adjustment engine pending) · research agent (manual now; automation pending license-clean data source).
**UNSUPPORTED/BLOCKED:** tgstat code reuse (no license) · tg-ads-mcp as running server (needs MCP host; mirrored via own adapter instead) · tg-channel-stats (repo gone) · auto-spending without approval (by design).

## 6. Environment template (no secrets)

```
TELEGRAM_ADS_TOKEN=            # promoteapi bearer
SUPABASE_REF=                  # project ref
SUPABASE_SERVICE_KEY=          # rotate: old key invalidated Oct 18
GITHUB_TOKEN=                  # contents read/write
VERCEL_TOKEN=                  # deploys
ADMIN_IDS=                     # comma-separated telegram ids
```

## 7. Rollback & security

All deploys via git revert + `vercel --prod` (project linked). Secrets never committed. Ads actions reversible via pause; deletions have 10-min cooldown — prefer pause over delete. Daily spend = remaining tanks + cash; hard cap only via owner approval.

## 8. Roadmap (needs owner green-light per wave)

W1: research-agent MVP (channel discovery w/ t.me verification, forex classification, CSV output)
W2: optimizer MVP (CPM/CPC/CPS tracker + bid-adjust recommendations from live data)
W3: dashboard MVP (supabase-backed, 15-country filters, CSV import)
W4: license-clean stats source research (replace tgstat gap)
