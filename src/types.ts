/**
 * Shared types for the Pangolinfo Review Mining MCP server.
 *
 * The review object shape below mirrors the Pangolinfo Amazon Review API
 * response contract documented at docs.pangolinfo.com
 * (data.json[].data.results[]), as also seen in the measured Oct 2026
 * MCP response for get_amazon_reviews. Field names are the API's own;
 * nothing here invents a new upstream field.
 */

/** One review, normalized from the upstream review object. */
export interface Review {
  reviewId: string;
  asin: string;
  author: string;
  /** Raw date string as returned, e.g. "October 14, 2026". */
  date: string;
  /** Parsed ISO date (YYYY-MM-DD) when the raw string parses, else null. */
  dateIso: string | null;
  country: string;
  /** Raw star string as returned, e.g. "5.0 out of 5 stars". */
  starRaw: string;
  /** Numeric star rating 1-5 when parseable, else null. */
  star: number | null;
  title: string;
  content: string;
  purchased: boolean;
  vineVoice: boolean;
  /** Parsed "helpful" vote count; "" or unparseable counts as 0. */
  helpfulCount: number;
  hasMedia: boolean;
}

/** Raw upstream review object (subset of fields we consume). */
export interface UpstreamReview {
  reviewId?: string;
  asin?: string;
  author?: string;
  date?: string;
  country?: string;
  star?: string;
  title?: string;
  content?: string;
  purchased?: boolean;
  vineVoice?: boolean;
  helpful?: string;
  imgs?: string[] | null;
  videos?: string[] | null;
  [key: string]: unknown;
}

/** Arguments accepted by the upstream get_amazon_reviews tool.
 *  Confirmed live via tools/list on 2026-10-26 (metadata call, free). */
export interface UpstreamReviewArgs {
  asin: string;
  site?: string;
  pageCount?: number;
  filterByStar?: string;
  sortBy?: string;
  mediaType?: string;
}

/** Normalized result of one upstream review fetch. */
export interface ReviewFetchResult {
  asin: string;
  site: string;
  /** Total review count as returned by upstream (string), or null. */
  totalReviews: string | null;
  /** Credits actually charged, exactly as returned (pointCost). */
  pointCost: number | null;
  reviews: Review[];
}

/** Minimal interface any review-data source must satisfy.
 *  Live mode uses the MCP bridge client; tests inject a mock. */
export interface UpstreamReviewsClient {
  fetchReviews(args: UpstreamReviewArgs): Promise<ReviewFetchResult>;
}
