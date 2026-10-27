# Test report — Pangolinfo Review Mining MCP v0.1.0 (local build)

Date: 2026-10-26. Status: **built and tested on mocked data only.
Live end-to-end testing is PENDING** (stored Pangolinfo API key expired
2026-10-24; no live backend call was made by this project).

## Live end-to-end test (2026-10-26, 7-day key supplied by Joe, used transiently)

Ran the built server in live mode (not mock) against ASIN B0FQFB8FMG,
1 page per call, 2 calls = 2 pages total:
- `get_product_reviews`: pointCost as returned = **5 credits for 1 page**,
  totalReviews = 4,446 (live, up from the 4,268 Oct 12 baseline),
  10 reviews returned.
- `mine_complaints` (critical filter): billing as returned = **5 credits
  for 1 page**, critical total = 1,457, 4 complaints tagged on the page
  (e.g. 1-star "So whack" → battery_power/sound_quality/
  returns_refunds/app_software; 2-star "Defective pair" →
  quality_defect).
- **Billing discrepancy resolved for the live MCP path: actual charge is
  5 credits/page.** The upstream tool description's "10 credits/page"
  is stale/wrong; the server's verbatim pointCost reporting stands.
- Server stderr confirmed live mode ("Serving 5 review-mining tools
  over stdio (live mode)"). No key was stored in source, fixtures, or
  docs; the 7-day key was used transiently for this test only.

## Correction (2026-10-26, independent re-run)

An independent re-run of `npm test` after delivery found 1 failing test:
`parseReviewDate` shifted date-only strings back one day for timezones
east of UTC, because it formatted via `toISOString()`. Fixed in
`src/analysis.ts` to use local calendar parts; re-run is green:
17 pass, 0 fail.

## What ran

Command: `npm test` (build via `tsc`, then `node --test`).

Result: **17 tests, 17 passed, 0 failed.**

| Suite | Tests | What it covers |
|---|---|---|
| `test/analysis.test.ts` | 8 | `parseStar`, `parseHelpful`, `parseReviewDate`, lexicon sanity, complaint tagging incl. firing keyword, null-tag case, sentiment math (distribution, averages, shares, monthly buckets), topic ranking + example cap |
| `test/tools.test.ts` | 8 | All 5 tool handlers against the mocked upstream; `minHelpful` filter; sentiment math on the mocked set (avg 2.75, negative 0.5, critical 0.63, positive 0.38); topic tie-break; baseline cited only for B0FQFB8FMG; unknown-tool error; baseline fixture provenance |
| `test/stdio.test.ts` | 1 | Spawns the real server in mock mode and speaks MCP JSON-RPC: `initialize` → `tools/list` (exactly the 5 review-mining tools) → `tools/call review_sentiment_summary` (8 reviews, avg 2.75) |

## Data provenance (what is real, what is mocked)

- **Mocked (all test reviews):** synthetic authors "Mock Reviewer A" …
  in `src/mock.ts`. Nothing here is a real Amazon review.
- **Real, measured, aggregate only:** `fixtures/airpods-pro-3-baseline.json`
  — Apple AirPods Pro 3 (ASIN B0FQFB8FMG), 4,268 total / 1,392
  negative reviews, measured 2026-10-12. Used as a labeled historical
  reference in `review_mining_report`, never as current data.
- **Real, confirmed live (metadata only, free):** upstream
  `get_amazon_reviews` tool name + input schema, confirmed via
  `tools/list` on 2026-10-26. No `tools/call` was made against the
  live backend by this project (key expired; mock mode used instead).
- **Real, from docs:** Review API parameter/response contract
  (docs.pangolinfo.com Review API page): `bizContext.bizKey=review`,
  `pageCount` 1–10, `filterByStar`, `sortBy`, `mediaType`,
  `parserName=amzReviewV2`, response shape
  `data.json[].data.{totalReviews, results[]}`, review fields
  (`reviewId`, `author`, `star`, `title`, `content`, `date`,
  `country`, `purchased`, `vineVoice`, `helpful`, `imgs`, `videos`,
  `attributes`, `asin`), 5 credits/page billing note.
- **Real, from a measured artifact:** Oct 2026 `get_amazon_reviews`
  response shape (`code 0`, `pointCost 5`, `totalReviews "4318"` for
  one page) — used only to validate the response parser's shape, not
  copied as test data.

## Unconfirmed items (explicit — nothing here is fabricated)

1. **Direct REST endpoint URL:** the docs page's request-URL and
   example blocks did not survive text extraction, and no workspace
   file records the Review API's REST URL. The server therefore uses
   the MCP-bridge path only; no REST URL is hardcoded anywhere.
2. **Billing rate 5 vs 10 credits/page:** docs + measured `pointCost`
   say 5/page; the upstream MCP tool description says 10/page. The
   server reports `pointCost` verbatim and flags the discrepancy in
   every billing note. Resolve after key reconnect.
3. **Live behavior of the bridge:** lazy MCP-client connect, upstream
   error mapping, and multi-page concatenation are implemented but
   not exercised against the live backend (key expired). The parser
   handles the documented response shape, including non-zero page
   codes (skipped) and non-zero top-level codes (thrown as errors).
4. **mcprush form steps 3–6:** the read-only submission check did not
   expand the server wizard's later steps, so the "no video field"
   note covers only the expanded steps and the publisher checklist.

## Pending items (need the user / future work)

1. **Live end-to-end test** after the Pangolinfo API key is
   reconnected: run `get_product_reviews` for a known ASIN, confirm
   `pointCost`, distribution math on real reviews, and the billing
   discrepancy.
2. **GitHub repo + npm publish** (needs write-access confirmation;
   GitHub write access is unverified — nothing was pushed).
3. **mcprush submission** (after publish; review takes up to two
   working days).
4. **Direct-REST mode** (only after the REST URL is confirmed).
5. **Non-English complaint lexicons** (v1 lexicon is English only).

## Explicitly NOT done

- No GitHub push, no npm publish, no directory submission.
- No live backend call with any key (expired or otherwise).
- No API key, token, or credential stored in source, fixtures, or docs
  (key is read only from `PANGOLINFO_API_KEY` at runtime).
- No invented endpoint, parameter, response field, or review datum.

## v0.1.2 lazy-key startup (2026-10-27)

Cause: MCPVault verification failed at stage initialize with
process_exited_code_1, because the server threw at startup when
PANGOLINFO_API_KEY was not set (reproduced locally: Fatal message,
process exits before answering initialize).

Change: the server no longer requires the key to start. Startup builds
a MissingKeyUpstreamClient when no key is set (mock mode unchanged);
initialize and tools/list succeed without a key, and only live tool
calls fail, cleanly, with a clear "PANGOLINFO_API_KEY is not set"
message (returned as an isError tool result, not a crash). Server
version bumped 0.1.1 → 0.1.2 (package.json, src/index.ts,
src/upstream.ts, server.json); server.json marks PANGOLINFO_API_KEY
isRequired false, matching the new behavior.

Tests: `npm test` 18/18 pass, including the new regression test
"stdio server starts without an API key and fails live calls cleanly"
(initialize returns serverInfo version 0.1.2, tools/list returns 5
tools, get_product_reviews without a key returns isError with the
missing-key message). No live backend call was made for this version;
the MCPVault nightly re-run (key on file in its edit-page env vars)
remains the live verification path.
