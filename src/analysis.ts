/**
 * Pure analysis helpers for review mining.
 *
 * Everything here is local computation over reviews already fetched from
 * Pangolinfo. No network, no API keys, no invented upstream data.
 *
 * Complaint tagging is a transparent keyword heuristic (English lexicon,
 * v1). It is NOT a machine-learning classifier and must not be presented
 * as one. Non-English reviews will under-match until a lexicon for their
 * language is added — see LIMITATIONS in the README.
 */
import type { Review } from "./types.js";

/** Parse "5.0 out of 5 stars" (or "1.0 out of 5 stars") to a number. */
export function parseStar(starRaw: string): number | null {
  const m = /([1-5])(?:\.0)?\s*out of 5 stars/i.exec(starRaw ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 5 ? n : null;
}

/** Parse "2 people found this helpful" (or "1 person ...") to a count.
 *  Empty string / unparseable input counts as 0. */
export function parseHelpful(helpfulRaw: string | undefined | null): number {
  if (!helpfulRaw) return 0;
  const m = /(\d+)\s+pe(?:ople|rson)\s+found this helpful/i.exec(helpfulRaw);
  return m ? Number(m[1]) : 0;
}

/** Parse upstream date strings such as "October 14, 2026" to ISO date.
 *  Returns null when the string does not parse. */
export function parseReviewDate(dateRaw: string): string | null {
  if (!dateRaw) return null;
  const d = new Date(dateRaw);
  if (Number.isNaN(d.getTime())) return null;
  // Upstream review dates are date-only strings ("October 14, 2026").
  // Formatting via toISOString() would shift the day back for timezones
  // east of UTC, so use the local calendar parts to keep the written date.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "2026-10-14" -> "2026-10"; null stays null. */
export function monthBucket(dateIso: string | null): string | null {
  return dateIso ? dateIso.slice(0, 7) : null;
}

/** Normalize one upstream review object into a Review. */
export function normalizeReview(
  raw: {
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
  },
  fallbackAsin: string,
): Review {
  const starRaw = raw.star ?? "";
  const date = raw.date ?? "";
  return {
    reviewId: raw.reviewId ?? "",
    asin: raw.asin || fallbackAsin,
    author: raw.author ?? "",
    date,
    dateIso: parseReviewDate(date),
    country: raw.country ?? "",
    starRaw,
    star: parseStar(starRaw),
    title: raw.title ?? "",
    content: raw.content ?? "",
    purchased: raw.purchased ?? false,
    vineVoice: raw.vineVoice ?? false,
    helpfulCount: parseHelpful(raw.helpful),
    hasMedia:
      (Array.isArray(raw.imgs) && raw.imgs.length > 0) ||
      (Array.isArray(raw.videos) && raw.videos.length > 0),
  };
}

/**
 * Complaint theme lexicon (English, v1). Each theme lists lowercase
 * substring keywords matched against "title + content".
 * Keep this list short and explainable: every match is traceable to the
 * keyword that fired, which the tools report.
 */
export const COMPLAINT_THEMES: Record<string, string[]> = {
  quality_defect: [
    "defective", "broken", "damaged", "faulty", "stopped working",
    "doesn't work", "does not work", "poor quality", "falls apart",
    "cracked", "malfunction",
  ],
  battery_power: [
    "battery", "charging", "won't charge", "battery drain", "dies quickly",
  ],
  connectivity: [
    "bluetooth", "disconnect", "pairing", "won't connect", "connection",
    "keeps cutting",
  ],
  comfort_fit: [
    "hurt", "painful", "uncomfortable", "ears hurt", "too big",
    "too small", "falls out",
  ],
  sound_quality: [
    "harsh", "sound quality", "bass", "treble", "muffled", "too quiet",
    "audio",
  ],
  shipping_delivery: [
    "shipping", "delivery", "arrived late", "arrived damaged",
    "packaging", "missing item",
  ],
  returns_refunds: ["return", "refund", "replacement", "send back"],
  value_price: [
    "overpriced", "not worth", "expensive", "waste of money", "ripoff",
  ],
  authenticity: ["fake", "counterfeit", "not original", "used"],
  app_software: ["app", "equalizer", "software", "update", "firmware"],
};

export interface TaggedComplaint {
  review: Review;
  /** Themes matched, with the keyword that fired for each. */
  themes: Array<{ theme: string; keyword: string }>;
}

/** Tag complaint themes in one review. Returns [] when nothing matches. */
export function tagComplaints(review: Review): TaggedComplaint | null {
  const haystack = `${review.title} ${review.content}`.toLowerCase();
  const themes: Array<{ theme: string; keyword: string }> = [];
  for (const [theme, keywords] of Object.entries(COMPLAINT_THEMES)) {
    const hit = keywords.find((k) => haystack.includes(k));
    if (hit) themes.push({ theme, keyword: hit });
  }
  return themes.length > 0 ? { review, themes } : null;
}

/** Tag complaints across many reviews. */
export function mineComplaints(reviews: Review[]): TaggedComplaint[] {
  const out: TaggedComplaint[] = [];
  for (const r of reviews) {
    const tagged = tagComplaints(r);
    if (tagged) out.push(tagged);
  }
  return out;
}

export interface SentimentSummary {
  reviewsAnalyzed: number;
  /** Counts per star value 1-5 plus "unknown" for unparseable stars. */
  distribution: Record<string, number>;
  /** Mean over reviews with a parseable star, or null when none. */
  averageStar: number | null;
  /** Share of reviews rated 1-2 stars. */
  negativeShare: number;
  /** Share of reviews rated 1-3 stars (upstream "critical" band). */
  criticalShare: number;
  /** Share of reviews rated 4-5 stars. */
  positiveShare: number;
  /** Monthly buckets: { count, averageStar, negativeCount }. */
  monthlyTrend: Record<
    string,
    { count: number; averageStar: number | null; negativeCount: number }
  >;
}

/** Compute rating distribution, averages and a monthly trend. */
export function summarizeSentiment(reviews: Review[]): SentimentSummary {
  const distribution: Record<string, number> = {
    "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, unknown: 0,
  };
  let starSum = 0;
  let starCount = 0;
  let negative = 0;
  let critical = 0;
  let positive = 0;
  const months = new Map<
    string,
    { count: number; sum: number; n: number; negativeCount: number }
  >();
  for (const r of reviews) {
    const key = r.star === null ? "unknown" : String(r.star);
    distribution[key] = (distribution[key] ?? 0) + 1;
    if (r.star !== null) {
      starSum += r.star;
      starCount += 1;
      if (r.star <= 2) negative += 1;
      if (r.star <= 3) critical += 1;
      if (r.star >= 4) positive += 1;
    }
    const month = monthBucket(r.dateIso) ?? "unknown";
    const bucket = months.get(month) ?? {
      count: 0, sum: 0, n: 0, negativeCount: 0,
    };
    bucket.count += 1;
    if (r.star !== null) {
      bucket.sum += r.star;
      bucket.n += 1;
      if (r.star <= 2) bucket.negativeCount += 1;
    }
    months.set(month, bucket);
  }
  const monthlyTrend: SentimentSummary["monthlyTrend"] = {};
  for (const month of [...months.keys()].sort()) {
    const b = months.get(month)!;
    monthlyTrend[month] = {
      count: b.count,
      averageStar: b.n > 0 ? round2(b.sum / b.n) : null,
      negativeCount: b.negativeCount,
    };
  }
  const total = reviews.length;
  return {
    reviewsAnalyzed: total,
    distribution,
    averageStar: starCount > 0 ? round2(starSum / starCount) : null,
    negativeShare: total > 0 ? round2(negative / total) : 0,
    criticalShare: total > 0 ? round2(critical / total) : 0,
    positiveShare: total > 0 ? round2(positive / total) : 0,
    monthlyTrend,
  };
}

export interface ComplaintTopic {
  theme: string;
  count: number;
  /** Share of complaint-tagged reviews carrying this theme. */
  share: number;
  /** Up to 3 example review titles with ids, for traceability. */
  examples: Array<{ reviewId: string; title: string }>;
}

/** Rank complaint themes across tagged complaints. */
export function topComplaintTopics(
  tagged: TaggedComplaint[],
  topN: number,
): ComplaintTopic[] {
  const counts = new Map<string, number>();
  const examples = new Map<string, Array<{ reviewId: string; title: string }>>();
  for (const t of tagged) {
    for (const th of t.themes) {
      counts.set(th.theme, (counts.get(th.theme) ?? 0) + 1);
      const list = examples.get(th.theme) ?? [];
      if (list.length < 3) {
        list.push({ reviewId: t.review.reviewId, title: t.review.title });
      }
      examples.set(th.theme, list);
    }
  }
  const total = tagged.length;
  return [...counts.entries()]
    .map(([theme, count]) => ({
      theme,
      count,
      share: total > 0 ? round2(count / total) : 0,
      examples: examples.get(theme) ?? [],
    }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme))
    .slice(0, topN);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
