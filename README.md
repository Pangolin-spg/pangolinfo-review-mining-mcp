# Pangolinfo Review Mining MCP

A differentiated, review-mining-only MCP server for Amazon product reviews.
It mines what buyers complain about, how sentiment trends, and which
complaint themes dominate — it does **not** duplicate the general
Pangolinfo Amazon Data MCP.

## How it differs from the general Amazon Data MCP

| | General Amazon Data MCP | This Review Mining MCP |
|---|---|---|
| Scope | 19+ tools: product search, product detail, best sellers, new releases, sellers, categories, niches, WIPO, SERP, Alexa | 5 tools, reviews only |
| Intent | General Amazon commerce intelligence | Review mining: complaints, sentiment, complaint topics |
| Analysis | Returns raw data | Local analysis on top of fetched reviews (keyword-theme tagging, distribution, monthly trend, combined report) |
| Upstream | Hosted Pangolinfo MCP server | Same hosted server's `get_amazon_reviews` tool, as an MCP client |

If you need product search or anything beyond reviews, use the general
MCP. If you need to know *what buyers complain about and how that
changes over time*, use this one.

## Architecture

```
MCP client (Claude Code, Cursor, Codex, ...)
  └─ stdio ─► this server (src/index.ts)
        └─ Streamable HTTP MCP client ─► https://mcp.pangolinfo.com/mcp
              └─ upstream tool: get_amazon_reviews
        └─ local analysis (src/analysis.ts): tagging, sentiment, topics
```

The server is a bridge plus analysis. It stores no API key and no
review data; the key is sent only as an `Authorization: Bearer` header
to the hosted server, taken from the environment.

Why a bridge instead of direct REST calls: the Pangolinfo docs page for
the Review API lists parameters and response fields, but its request-URL
and example blocks did not survive text extraction, so the direct REST
endpoint is **unconfirmed** and deliberately not hardcoded here. The
bridge path uses only confirmed facts: the hosted endpoint
(`https://mcp.pangolinfo.com/mcp`, from the official amazon-data-mcp
README) and the upstream `get_amazon_reviews` tool name + input schema
(confirmed live via `tools/list` on 2026-10-26, a free metadata call).
See TODOs below for the direct-REST follow-up.

## Setup

Requirements: Node.js 18 or newer (developed/tested on Node 24).

```bash
npm install
npm run build
```

Run (live mode):

```bash
export PANGOLINFO_API_KEY="your-key-here"   # never commit a real key
node dist/src/index.js
```

Run (mock mode, no network, no key — for tests and demos):

```bash
PANGOLINFO_REVIEW_MINING_MOCK=1 node dist/src/index.js
```

MCP client configuration (example, Claude Code style):

```json
{
  "mcpServers": {
    "pangolinfo-review-mining": {
      "command": "node",
      "args": ["/absolute/path/to/pangolinfo-review-mining-mcp/dist/src/index.js"],
      "env": { "PANGOLINFO_API_KEY": "your-key-here" }
    }
  }
}
```

Environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `PANGOLINFO_API_KEY` | Yes (live mode) | Bearer token for the hosted Pangolinfo MCP server |
| `PANGOLINFO_MCP_URL` | No | Upstream MCP endpoint; default `https://mcp.pangolinfo.com/mcp` |
| `PANGOLINFO_REVIEW_MINING_MOCK` | No | `=1` enables mock mode (mocked reviews, no network) |

## Tools (5, all review-mining only)

| Tool | What it does | Key inputs |
|---|---|---|
| `get_product_reviews` | Paginated review fetch for one ASIN, with billing (`pointCost`) reported verbatim | `asin` (required), `site`, `pageCount` (1–10), `filterByStar`, `sortBy`, `mediaType` |
| `mine_complaints` | Complaint signals from negative (`critical`, 1–3 star) reviews, each tagged with themes + firing keyword; optional `minHelpful` filter | `asin`, `site`, `pageCount`, `minHelpful` |
| `review_sentiment_summary` | Rating distribution, average star, negative/critical/positive shares, monthly trend | `asin`, `site`, `pageCount` |
| `top_complaint_topics` | Ranked complaint themes with counts, shares, example titles | `asin`, `site`, `pageCount`, `topN` |
| `review_mining_report` | Combined per-ASIN summary: totals, sentiment, top topics, most-endorsed complaints, billing; cites the Oct 12 baseline for B0FQFB8FMG as historical reference only | `asin`, `site`, `pageCount` |

Complaint themes (English keyword heuristic, v1 — transparent, not a
classifier): `quality_defect`, `battery_power`, `connectivity`,
`comfort_fit`, `sound_quality`, `shipping_delivery`, `returns_refunds`,
`value_price`, `authenticity`, `app_software`. Every match reports the
keyword that fired.

Marketplaces (`site`): `amz_us` (default), `amz_de`, `amz_uk`, `amz_jp`,
`amz_fr`, `amz_it`, `amz_es`, `amz_br`, `amz_au`, `amz_mx`, `amz_in`,
`amz_eg`, `amz_ae`, `amz_ca`.

## Billing

- The Review API is documented at **5 credits/page** (docs "积点消耗：
  5个/次" and per-page billing in `bizContext.pageCount`), and a
  measured Oct 2026 `get_amazon_reviews` call returned `pointCost: 5`
  for one page.
- **Discrepancy flagged:** the upstream MCP tool description currently
  states **10 credits/page**. This server does not resolve that
  discrepancy by assertion — every tool reports `pointCost` exactly as
  returned by the upstream response, and the billing note in each
  response names both figures.
- Free tier: 60 credits/month, recurring. At the measured 5/page rate
  that covers ~12 review pages/month; budget `pageCount` accordingly.
  `review_mining_report` makes two upstream fetches (all_stars +
  critical), so it costs twice one fetch.
- The stored Pangolinfo API key expired (measured 2026-10-24). Live
  end-to-end testing is **pending** on the key being reconnected; see
  TEST_REPORT.md.

## Tests

```bash
npm test   # builds, then runs node --test on dist/test/
```

17 tests, all passing at build time (see TEST_REPORT.md): analysis
unit tests, tool-handler tests against the mocked upstream, the Oct 12
baseline fixture test, and a stdio smoke test that spawns the real
server in mock mode and speaks MCP JSON-RPC to it. All test review
data is mocked (synthetic authors "Mock Reviewer A" …); the only real
measured numbers in the repo are the aggregate baseline in
`fixtures/airpods-pro-3-baseline.json` (4,268 total / 1,392 negative
reviews for ASIN B0FQFB8FMG, measured 2026-10-12, reference only).

## Limitations (read before presenting results as fact)

- Complaint tagging is an English keyword heuristic, not sentiment ML.
  Non-English reviews will under-match until lexicons for their
  languages are added.
- Star values come from strings like "5.0 out of 5 stars"; unparseable
  stars fall into `unknown` and are excluded from averages.
- Dates come from strings like "October 14, 2026"; unparseable dates
  fall into the `unknown` monthly bucket.
- `totalReviews` is returned by upstream as a string and may be empty
  when unavailable; it is passed through, not computed.
- `review_mining_report` fetches all_stars + critical, so its review
  counts are per-fetch, not a single de-duplicated sample.

## Publication status (2026-10-26)

mcprush accepts MCP servers or agent skills only (verified 2026-10-26:
its server wizard requires a repo / npm / PyPI / container / hosted MCP
endpoint and passes `initialize` + `tools/list` verification).

- GitHub repo: live at https://github.com/Pangolin-spg/pangolinfo-review-mining-mcp
- npm package: `pangolinfo-review-mining-mcp` 0.1.1, published 2026-10-26 (0.1.0 was the first publish the same day; 0.1.1 adds the `mcpName` field required by the MCP Registry)
- mcprush listing: submitted 2026-10-26, in review (expected URL:
  https://mcprush.com/pangolin-spg/pangolinfo-review-mining-mcp)
- Server-card info needed: name, one-line description, and a paragraph
  of at least 120 characters on what it does and who it is for.
- Pricing: free plan (or priced plans with name, monthly price, call
  allowance); review takes up to two working days.
- No video/intro URL field was visible in the submission form's
  expanded steps during the read-only check; if one appears, the
  project's intro videos are the Pangolinfo EN/ZH videos on file.
- Backlink rule (standing): any link back to pangolinfo.com content in
  a listing must carry `?utm_source=<platform>&utm_medium=referral`
  (plus `utm_content=<product>` when one platform carries several
  products) for GA4 referral attribution.

## TODOs / unconfirmed items

1. **Direct REST endpoint (unconfirmed):** the docs page's request-URL
   and example blocks did not extract, and no workspace file records
   the Review API's REST URL. The bridge design avoids needing it, but
   a direct-REST mode should not be added until the URL is confirmed
   from docs or a measured call.
2. **Live end-to-end test (done 2026-10-26):** verified with a temporary
   7-day key: `get_product_reviews` + `mine_complaints` on ASIN
   B0FQFB8FMG, 5 credits/page each, 4,446 total reviews / 1,457
   critical at time of test.
3. **Billing discrepancy (resolved 2026-10-26):** live `pointCost` =
   5/page; the upstream tool description's 10/page is stale.
4. **Publish (done 2026-10-26):** GitHub repo live, npm 0.1.0
   published, mcprush listing submitted (in review).
