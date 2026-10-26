/**
 * Unit tests for analysis helpers. All data here is mocked or synthetic.
 * Run with: npm test (builds, then node --test dist/test/)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLAINT_THEMES,
  mineComplaints,
  parseHelpful,
  parseReviewDate,
  parseStar,
  summarizeSentiment,
  tagComplaints,
  topComplaintTopics,
} from "../src/analysis.js";
import type { Review } from "../src/types.js";

function review(partial: Partial<Review>): Review {
  return {
    reviewId: "T1", asin: "B0MOCK0001", author: "Tester",
    date: "October 14, 2026", dateIso: "2026-10-14",
    country: "United States", starRaw: "5.0 out of 5 stars", star: 5,
    title: "", content: "", purchased: true, vineVoice: false,
    helpfulCount: 0, hasMedia: false, ...partial,
  };
}

test("parseStar handles upstream star strings", () => {
  assert.equal(parseStar("5.0 out of 5 stars"), 5);
  assert.equal(parseStar("1.0 out of 5 stars"), 1);
  assert.equal(parseStar("3.0 out of 5 stars"), 3);
  assert.equal(parseStar(""), null);
  assert.equal(parseStar("no rating"), null);
});

test("parseHelpful handles vote strings and empties", () => {
  assert.equal(parseHelpful("2 people found this helpful"), 2);
  assert.equal(parseHelpful("1 person found this helpful"), 1);
  assert.equal(parseHelpful(""), 0);
  assert.equal(parseHelpful(null), 0);
  assert.equal(parseHelpful(undefined), 0);
});

test("parseReviewDate handles upstream date strings", () => {
  assert.equal(parseReviewDate("October 14, 2026"), "2026-10-14");
  assert.equal(parseReviewDate("May 23, 2026"), "2026-05-23");
  assert.equal(parseReviewDate(""), null);
  assert.equal(parseReviewDate("not a date"), null);
});

test("complaint lexicon is non-empty and explainable", () => {
  assert.ok(Object.keys(COMPLAINT_THEMES).length >= 8);
  for (const kws of Object.values(COMPLAINT_THEMES)) {
    assert.ok(kws.length > 0);
  }
});

test("tagComplaints matches themes and reports the firing keyword", () => {
  const r = review({
    title: "Stopped working",
    content: "Bluetooth keeps disconnecting and I want a refund.",
    star: 1, starRaw: "1.0 out of 5 stars",
  });
  const tagged = tagComplaints(r);
  assert.ok(tagged);
  const themes = tagged.themes.map((t) => t.theme);
  assert.ok(themes.includes("connectivity"));
  assert.ok(themes.includes("returns_refunds"));
  assert.ok(tagged.themes.every((t) => t.keyword.length > 0));
});

test("tagComplaints returns null when nothing matches", () => {
  const r = review({ title: "Great", content: "Love it, highly recommended." });
  assert.equal(tagComplaints(r), null);
});

test("summarizeSentiment computes distribution, averages and shares", () => {
  const reviews = [
    review({ star: 1, starRaw: "1.0 out of 5 stars", dateIso: "2026-10-14" }),
    review({ star: 5, starRaw: "5.0 out of 5 stars", dateIso: "2026-10-14" }),
    review({ star: 5, starRaw: "5.0 out of 5 stars", dateIso: "2026-09-20" }),
    review({ star: null, starRaw: "", dateIso: null }),
  ];
  const s = summarizeSentiment(reviews);
  assert.equal(s.reviewsAnalyzed, 4);
  assert.equal(s.distribution["1"], 1);
  assert.equal(s.distribution["5"], 2);
  assert.equal(s.distribution.unknown, 1);
  assert.equal(s.averageStar, 3.67);
  assert.equal(s.negativeShare, 0.25);
  assert.equal(s.positiveShare, 0.5);
  assert.equal(s.monthlyTrend["2026-10"].count, 2);
  assert.equal(s.monthlyTrend["2026-09"].count, 1);
  assert.equal(s.monthlyTrend.unknown.count, 1);
});

test("topComplaintTopics ranks themes and caps examples", () => {
  const tagged = mineComplaints([
    review({ title: "A", content: "Defective and broken.", star: 1, starRaw: "1.0 out of 5 stars" }),
    review({ title: "B", content: "Broken again.", star: 1, starRaw: "1.0 out of 5 stars" }),
    review({ title: "C", content: "Battery drains fast.", star: 2, starRaw: "2.0 out of 5 stars" }),
  ]);
  const topics = topComplaintTopics(tagged, 10);
  assert.equal(topics[0].theme, "quality_defect");
  assert.equal(topics[0].count, 2);
  assert.ok(topics[0].examples.length <= 3);
});
