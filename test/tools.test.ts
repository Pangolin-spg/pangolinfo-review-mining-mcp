/**
 * Tool-handler tests against the mocked upstream client.
 * All review data here is mocked (see src/mock.ts). No network, no key.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MockUpstreamClient } from "../src/mock.js";
import { AIRPODS_BASELINE, handleTool } from "../src/tools.js";

const client = new MockUpstreamClient();
const ASIN = "B0MOCK0001";

test("get_product_reviews returns mocked reviews plus billing as returned", async () => {
  const res = await handleTool(client, "get_product_reviews", {
    asin: ASIN,
  }) as { reviewsReturned: number; pointCost: number; totalReviews: string };
  assert.equal(res.reviewsReturned, 8);
  assert.equal(res.pointCost, 5);
  assert.equal(res.totalReviews, "8");
});

test("mine_complaints finds critical reviews and tags themes", async () => {
  const res = await handleTool(client, "mine_complaints", {
    asin: ASIN,
  }) as {
    criticalReviewsFetched: number;
    complaintsFound: number;
    complaints: Array<{ themes: Array<{ theme: string }> }>;
  };
  assert.equal(res.criticalReviewsFetched, 5);
  assert.equal(res.complaintsFound, 5);
  const themes = new Set(res.complaints.flatMap((c) => c.themes.map((t) => t.theme)));
  assert.ok(themes.has("connectivity"));
  assert.ok(themes.has("battery_power"));
  assert.ok(themes.has("authenticity"));
});

test("mine_complaints honors minHelpful", async () => {
  const res = await handleTool(client, "mine_complaints", {
    asin: ASIN, minHelpful: 5,
  }) as { complaints: Array<{ helpfulCount: number }> };
  assert.ok(res.complaints.length >= 1);
  assert.ok(res.complaints.every((c) => c.helpfulCount >= 5));
});

test("review_sentiment_summary math matches the mocked set", async () => {
  const res = await handleTool(client, "review_sentiment_summary", {
    asin: ASIN,
  }) as {
    reviewsAnalyzed: number;
    distribution: Record<string, number>;
    averageStar: number;
    negativeShare: number;
    criticalShare: number;
    positiveShare: number;
  };
  assert.equal(res.reviewsAnalyzed, 8);
  assert.equal(res.distribution["1"], 3);
  assert.equal(res.distribution["5"], 2);
  assert.equal(res.averageStar, 2.75);
  assert.equal(res.negativeShare, 0.5);
  assert.equal(res.criticalShare, 0.63);
  assert.equal(res.positiveShare, 0.38);
});

test("top_complaint_topics ranks tied themes alphabetically on mocked set", async () => {
  const res = await handleTool(client, "top_complaint_topics", {
    asin: ASIN,
  }) as {
    topics: Array<{ theme: string; count: number; share: number }>;
  };
  // quality_defect (A "stopped working" + G "damaged") and returns_refunds
  // (A "refund" + C "Returning") tie at 2; alphabetical tie-break wins.
  assert.equal(res.topics[0].theme, "quality_defect");
  assert.equal(res.topics[0].count, 2);
  assert.equal(res.topics[0].share, 0.4);
  assert.equal(res.topics[1].theme, "returns_refunds");
  assert.equal(res.topics[1].count, 2);
});

test("review_mining_report cites the Oct 12 baseline only for B0FQFB8FMG", async () => {
  const withBaseline = await handleTool(client, "review_mining_report", {
    asin: "B0FQFB8FMG",
  }) as { baseline: typeof AIRPODS_BASELINE | null };
  const baseline = withBaseline.baseline;
  assert.ok(baseline);
  assert.equal(baseline.totalReviews, 4268);
  assert.equal(baseline.negativeReviews, 1392);

  const without = await handleTool(client, "review_mining_report", {
    asin: ASIN,
  }) as { baseline: unknown };
  assert.equal(without.baseline, null);
});

test("unknown tool throws", async () => {
  await assert.rejects(
    handleTool(client, "search_amazon", { keyword: "x" }),
    /Unknown tool/,
  );
});

test("baseline fixture file carries provenance and the Oct 12 numbers", async () => {
  const url = new URL("../../fixtures/airpods-pro-3-baseline.json", import.meta.url);
  const fixture = JSON.parse(await readFile(url, "utf-8")) as {
    asin: string; totalReviews: number; negativeReviews: number; measuredDate: string;
  };
  assert.equal(fixture.asin, "B0FQFB8FMG");
  assert.equal(fixture.totalReviews, 4268);
  assert.equal(fixture.negativeReviews, 1392);
  assert.equal(fixture.measuredDate, "2026-10-12");
});
