/**
 * Review-mining tool definitions and handlers.
 *
 * Strictly review-mining scope: every tool reads Amazon product reviews
 * and analyzes them. There is deliberately NO product search, best
 * sellers, new releases, seller catalog, category, niche, WIPO, SERP or
 * Alexa tool here — those belong to the general Pangolinfo Amazon Data
 * MCP and are not duplicated.
 */
import {
  mineComplaints,
  summarizeSentiment,
  topComplaintTopics,
} from "./analysis.js";
import type {
  UpstreamReviewArgs,
  UpstreamReviewsClient,
} from "./types.js";

const SITES = [
  "amz_us", "amz_de", "amz_uk", "amz_jp", "amz_fr", "amz_it", "amz_es",
  "amz_br", "amz_au", "amz_mx", "amz_in", "amz_eg", "amz_ae", "amz_ca",
];
const STAR_FILTERS = [
  "all_stars", "five_star", "four_star", "three_star", "two_star",
  "one_star", "positive", "critical",
];
const SORTS = ["recent", "helpful"];
const MEDIA_TYPES = ["all_contents", "media_reviews_only"];
const ASIN_PATTERN = "^[A-Za-z0-9]{10}$";

const commonProps = {
  asin: {
    type: "string", pattern: ASIN_PATTERN,
    description: "10-character Amazon ASIN (case-insensitive).",
  },
  site: {
    type: "string", enum: SITES, default: "amz_us",
    description: "Amazon marketplace. Defaults to amz_us.",
  },
  pageCount: {
    type: "integer", minimum: 1, maximum: 10, default: 1,
    description:
      "Review pages to fetch (~10 reviews per page). Each page bills " +
      "credits on the Pangolinfo account — see billing notes.",
  },
};

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_product_reviews",
    description:
      "Fetch paginated Amazon product reviews for one ASIN via " +
      "Pangolinfo, with the upstream billing (pointCost) reported " +
      "verbatim. Billing: docs and measured calls show 5 credits/page; " +
      "the upstream tool description currently states 10 credits/page — " +
      "this tool reports pointCost as returned, it does not assert a rate.",
    inputSchema: {
      type: "object",
      properties: {
        ...commonProps,
        filterByStar: {
          type: "string", enum: STAR_FILTERS, default: "all_stars",
          description: "Star filter. 'critical' = negative reviews.",
        },
        sortBy: {
          type: "string", enum: SORTS, default: "recent",
          description: "Sort order: recent (default) or helpful.",
        },
        mediaType: {
          type: "string", enum: MEDIA_TYPES, default: "all_contents",
          description: "all_contents (default) or media_reviews_only.",
        },
      },
      required: ["asin"],
    },
  },
  {
    name: "mine_complaints",
    description:
      "Extract complaint signals from negative (critical, 1-3 star) " +
      "reviews for one ASIN. Tags each complaint review with " +
      "human-readable themes (quality_defect, battery_power, " +
      "connectivity, comfort_fit, sound_quality, shipping_delivery, " +
      "returns_refunds, value_price, authenticity, app_software) using " +
      "a transparent English keyword heuristic — not a classifier. " +
      "Optionally filter to complaints with at least minHelpful " +
      "helpful votes.",
    inputSchema: {
      type: "object",
      properties: {
        ...commonProps,
        minHelpful: {
          type: "integer", minimum: 0, default: 0,
          description: "Only keep complaints with at least this many helpful votes.",
        },
      },
      required: ["asin"],
    },
  },
  {
    name: "review_sentiment_summary",
    description:
      "Rating distribution, average star, negative/critical/positive " +
      "shares, and a monthly sentiment trend for one ASIN's reviews. " +
      "Pure local computation over fetched reviews.",
    inputSchema: {
      type: "object",
      properties: { ...commonProps },
      required: ["asin"],
    },
  },
  {
    name: "top_complaint_topics",
    description:
      "Ranked complaint themes across negative reviews for one ASIN, " +
      "with counts, shares, and example review titles for traceability.",
    inputSchema: {
      type: "object",
      properties: {
        ...commonProps,
        topN: {
          type: "integer", minimum: 1, maximum: 20, default: 10,
          description: "How many top themes to return.",
        },
      },
      required: ["asin"],
    },
  },
  {
    name: "review_mining_report",
    description:
      "Combined per-ASIN review-mining summary: totals, rating " +
      "distribution, monthly trend, top complaint topics, most-endorsed " +
      "complaints, and billing as returned. When the ASIN matches the " +
      "documented Oct 12, 2026 baseline (B0FQFB8FMG), the report also " +
      "cites that historical baseline for reference, clearly labeled " +
      "as historical — never as current data.",
    inputSchema: {
      type: "object",
      properties: { ...commonProps },
      required: ["asin"],
    },
  },
];

/** Historical measured baseline, reference only (see fixtures file). */
export const AIRPODS_BASELINE = {
  asin: "B0FQFB8FMG",
  product: "Apple AirPods Pro 3",
  measuredDate: "2026-10-12",
  totalReviews: 4268,
  negativeReviews: 1392,
  source: "Pangolinfo review-mining baseline, measured 2026-10-12",
};

type Args = Record<string, unknown>;

function baseArgs(a: Args): UpstreamReviewArgs {
  return {
    asin: String(a.asin),
    site: typeof a.site === "string" ? a.site : undefined,
    pageCount: typeof a.pageCount === "number" ? a.pageCount : undefined,
  };
}

function billingNote(pointCost: number | null, pageCount: number): string {
  return pointCost === null
    ? `Billing: upstream did not return a pointCost for ${pageCount} page(s); ` +
      `docs and measured calls show 5 credits/page, while the upstream ` +
      `tool description states 10 credits/page (discrepancy flagged).`
    : `Billing: upstream pointCost as returned = ${pointCost} credits for ` +
      `${pageCount} page(s). Docs and measured calls show 5 credits/page; ` +
      `the upstream tool description states 10 credits/page (discrepancy flagged).`;
}

export async function handleTool(
  client: UpstreamReviewsClient,
  name: string,
  args: Args,
): Promise<unknown> {
  const pageCount =
    typeof args.pageCount === "number" ? args.pageCount : 1;
  switch (name) {
    case "get_product_reviews": {
      const res = await client.fetchReviews({
        ...baseArgs(args),
        filterByStar:
          typeof args.filterByStar === "string" ? args.filterByStar : undefined,
        sortBy: typeof args.sortBy === "string" ? args.sortBy : undefined,
        mediaType:
          typeof args.mediaType === "string" ? args.mediaType : undefined,
      });
      return {
        asin: res.asin,
        site: res.site,
        totalReviews: res.totalReviews,
        reviewsReturned: res.reviews.length,
        billing: billingNote(res.pointCost, pageCount),
        pointCost: res.pointCost,
        reviews: res.reviews,
      };
    }
    case "mine_complaints": {
      const res = await client.fetchReviews({
        ...baseArgs(args),
        filterByStar: "critical",
      });
      const minHelpful =
        typeof args.minHelpful === "number" ? args.minHelpful : 0;
      const tagged = mineComplaints(res.reviews).filter(
        (t) => t.review.helpfulCount >= minHelpful,
      );
      return {
        asin: res.asin,
        site: res.site,
        totalReviews: res.totalReviews,
        criticalReviewsFetched: res.reviews.length,
        complaintsFound: tagged.length,
        billing: billingNote(res.pointCost, pageCount),
        method:
          "English keyword heuristic over title+content (see COMPLAINT_THEMES); not a classifier.",
        complaints: tagged.map((t) => ({
          reviewId: t.review.reviewId,
          star: t.review.star,
          title: t.review.title,
          helpfulCount: t.review.helpfulCount,
          date: t.review.date,
          themes: t.themes,
        })),
      };
    }
    case "review_sentiment_summary": {
      const res = await client.fetchReviews({
        ...baseArgs(args),
        filterByStar: "all_stars",
      });
      return {
        asin: res.asin,
        site: res.site,
        totalReviews: res.totalReviews,
        billing: billingNote(res.pointCost, pageCount),
        ...summarizeSentiment(res.reviews),
      };
    }
    case "top_complaint_topics": {
      const res = await client.fetchReviews({
        ...baseArgs(args),
        filterByStar: "critical",
      });
      const tagged = mineComplaints(res.reviews);
      const topN = typeof args.topN === "number" ? args.topN : 10;
      return {
        asin: res.asin,
        site: res.site,
        totalReviews: res.totalReviews,
        criticalReviewsFetched: res.reviews.length,
        complaintsTagged: tagged.length,
        billing: billingNote(res.pointCost, pageCount),
        topics: topComplaintTopics(tagged, topN),
      };
    }
    case "review_mining_report": {
      const [all, critical] = await Promise.all([
        client.fetchReviews({ ...baseArgs(args), filterByStar: "all_stars" }),
        client.fetchReviews({ ...baseArgs(args), filterByStar: "critical" }),
      ]);
      const sentiment = summarizeSentiment(all.reviews);
      const tagged = mineComplaints(critical.reviews);
      const topics = topComplaintTopics(tagged, 10);
      const topComplaints = [...tagged]
        .sort((a, b) => b.review.helpfulCount - a.review.helpfulCount)
        .slice(0, 5)
        .map((t) => ({
          reviewId: t.review.reviewId,
          star: t.review.star,
          title: t.review.title,
          helpfulCount: t.review.helpfulCount,
          themes: t.themes.map((x) => x.theme),
        }));
      const pointCost =
        (all.pointCost ?? 0) + (critical.pointCost ?? 0);
      return {
        asin: all.asin,
        site: all.site,
        totalReviews: all.totalReviews,
        reviewsAnalyzed: sentiment.reviewsAnalyzed,
        criticalReviewsFetched: critical.reviews.length,
        billing:
          `Billing: two upstream fetches (all_stars + critical), ` +
          `combined pointCost as returned = ${pointCost} credits for ` +
          `${pageCount} page(s) each. Docs and measured calls show ` +
          `5 credits/page; the upstream tool description states ` +
          `10 credits/page (discrepancy flagged).`,
        sentiment,
        topComplaintTopics: topics,
        mostEndorsedComplaints: topComplaints,
        baseline:
          String(args.asin).toUpperCase() === AIRPODS_BASELINE.asin
            ? {
                ...AIRPODS_BASELINE,
                note: "Historical reference only, measured 2026-10-12. " +
                  "Current totals come from totalReviews above.",
              }
            : null,
        method:
          "Complaint themes via English keyword heuristic; sentiment " +
          "from star distribution and monthly buckets. See README limitations.",
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
