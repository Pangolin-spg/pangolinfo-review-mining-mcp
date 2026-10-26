/**
 * Mocked upstream client for tests and the stdio smoke test.
 *
 * ALL reviews here are invented test data with synthetic authors
 * ("Mock Reviewer A" ...). Nothing here is a real Amazon review and
 * nothing here is presented as measured data. The only real measured
 * aggregate in this project lives in fixtures/airpods-pro-3-baseline.json
 * (Oct 12, 2026 baseline: 4,268 total / 1,392 negative reviews for
 * ASIN B0FQFB8FMG) and is used for reference only.
 */
import { normalizeReview } from "./analysis.js";
import type {
  ReviewFetchResult,
  UpstreamReview,
  UpstreamReviewArgs,
  UpstreamReviewsClient,
} from "./types.js";

const MOCKED: UpstreamReview[] = [
  {
    reviewId: "MOCK00000001", asin: "B0MOCK0001", author: "Mock Reviewer A",
    date: "October 14, 2026", country: "United States",
    star: "1.0 out of 5 stars", title: "Stopped working after a week",
    content: "The left earbud stopped working and bluetooth keeps disconnecting. I want a refund.",
    purchased: true, vineVoice: false, helpful: "12 people found this helpful",
    imgs: null, videos: null, attributes: null,
  },
  {
    reviewId: "MOCK00000002", asin: "B0MOCK0001", author: "Mock Reviewer B",
    date: "October 13, 2026", country: "United States",
    star: "2.0 out of 5 stars", title: "Battery drains too fast",
    content: "Battery drains in two hours and charging is unreliable. Disappointed with the quality.",
    purchased: true, vineVoice: false, helpful: "4 people found this helpful",
    imgs: null, videos: null, attributes: null,
  },
  {
    reviewId: "MOCK00000003", asin: "B0MOCK0001", author: "Mock Reviewer C",
    date: "October 12, 2026", country: "United States",
    star: "1.0 out of 5 stars", title: "Hurts my ears",
    content: "They hurt my ears after thirty minutes and the fit is terrible. Returning them.",
    purchased: true, vineVoice: false, helpful: "",
    imgs: null, videos: null, attributes: null,
  },
  {
    reviewId: "MOCK00000004", asin: "B0MOCK0001", author: "Mock Reviewer D",
    date: "October 11, 2026", country: "United States",
    star: "3.0 out of 5 stars", title: "Harsh sound, decent build",
    content: "The sound is harsh with too much bass, but the build itself feels solid.",
    purchased: false, vineVoice: false, helpful: "1 person found this helpful",
    imgs: null, videos: null, attributes: null,
  },
  {
    reviewId: "MOCK00000005", asin: "B0MOCK0001", author: "Mock Reviewer E",
    date: "October 10, 2026", country: "United States",
    star: "5.0 out of 5 stars", title: "Love them",
    content: "Great sound and comfortable all day. Highly recommended.",
    purchased: true, vineVoice: false, helpful: "7 people found this helpful",
    imgs: null, videos: null, attributes: null,
  },
  {
    reviewId: "MOCK00000006", asin: "B0MOCK0001", author: "Mock Reviewer F",
    date: "September 28, 2026", country: "United States",
    star: "4.0 out of 5 stars", title: "Good, minor app quirks",
    content: "Sound is good, but the app equalizer settings reset after every update.",
    purchased: true, vineVoice: true, helpful: "",
    imgs: null, videos: null, attributes: null,
  },
  {
    reviewId: "MOCK00000007", asin: "B0MOCK0001", author: "Mock Reviewer G",
    date: "September 20, 2026", country: "United States",
    star: "1.0 out of 5 stars", title: "Fake product?",
    content: "I suspect this is fake, the packaging was damaged and it looks used.",
    purchased: true, vineVoice: false, helpful: "2 people found this helpful",
    imgs: null, videos: null, attributes: null,
  },
  {
    reviewId: "MOCK00000008", asin: "B0MOCK0001", author: "Mock Reviewer H",
    date: "September 15, 2026", country: "United States",
    star: "5.0 out of 5 stars", title: "Excellent",
    content: "Excellent noise cancellation and battery life.",
    purchased: true, vineVoice: false, helpful: "",
    imgs: null, videos: null, attributes: null,
  },
];

export const MOCKED_REVIEWS = MOCKED;

/** Returns mocked reviews, honoring filterByStar the way upstream does:
 *  "critical" = 1-3 stars, "positive" = 4-5 stars, "N_star" = that star. */
export class MockUpstreamClient implements UpstreamReviewsClient {
  async fetchReviews(args: UpstreamReviewArgs): Promise<ReviewFetchResult> {
    const all = MOCKED.map((r) => normalizeReview(r, args.asin));
    const starOf = (r: { star: number | null }): number | null => r.star;
    let picked = all;
    const f = args.filterByStar ?? "all_stars";
    if (f === "critical") picked = all.filter((r) => (starOf(r) ?? 99) <= 3);
    else if (f === "positive") picked = all.filter((r) => (starOf(r) ?? 0) >= 4);
    else if (/^[a-z]+_star$/.test(f)) {
      const n = { one: 1, two: 2, three: 3, four: 4, five: 5 }[
        f.split("_")[0]
      ];
      picked = all.filter((r) => starOf(r) === n);
    }
    const pageCount = args.pageCount ?? 1;
    return {
      asin: args.asin,
      site: args.site ?? "amz_us",
      totalReviews: "8",
      pointCost: 5 * pageCount,
      reviews: picked,
    };
  }
}
