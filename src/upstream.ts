/**
 * Upstream review-data clients.
 *
 * LIVE MODE (default): this server acts as an MCP *client* to Pangolinfo's
 * hosted Streamable HTTP MCP server at https://mcp.pangolinfo.com/mcp
 * (endpoint confirmed by the official amazon-data-mcp README) and calls
 * the upstream `get_amazon_reviews` tool, whose name and input schema
 * were confirmed live via tools/list on 2026-10-26 (metadata call, free).
 * The API key travels only as an Authorization Bearer header taken from
 * the PANGOLINFO_API_KEY environment variable. It is never logged and
 * never stored in source.
 *
 * MOCK MODE (PANGOLINFO_REVIEW_MINING_MOCK=1): returns canned, clearly
 * labeled mocked reviews with no network and no key. Used by the test
 * suite and the stdio smoke test only.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { normalizeReview } from "./analysis.js";
import type {
  ReviewFetchResult,
  UpstreamReview,
  UpstreamReviewArgs,
  UpstreamReviewsClient,
} from "./types.js";

export const DEFAULT_UPSTREAM_URL = "https://mcp.pangolinfo.com/mcp";
export const UPSTREAM_TOOL_NAME = "get_amazon_reviews";

/** Parse the upstream tool-call result into a ReviewFetchResult.
 *  The upstream returns content[0].text as a JSON string shaped like
 *  { code, message, pointCost, data: { json: [{ code, data:
 *  { totalReviews, results[] } }], url, taskId } } — confirmed by the
 *  measured Oct 2026 get_amazon_reviews response. */
export function parseUpstreamResult(
  result: unknown,
  asin: string,
  site: string,
): ReviewFetchResult {
  const content = (result as { content?: unknown })?.content;
  const textItem = Array.isArray(content)
    ? content.find(
        (c): c is { type: string; text: string } =>
          typeof c === "object" &&
          c !== null &&
          (c as { type?: string }).type === "text" &&
          typeof (c as { text?: unknown }).text === "string",
      )
    : undefined;
  if (!textItem) {
    throw new Error(
      "Upstream get_amazon_reviews returned no text content to parse.",
    );
  }
  let payload: {
    code?: number;
    message?: string;
    pointCost?: number;
    data?: {
      json?: Array<{
        code?: number;
        data?: { totalReviews?: string; results?: UpstreamReview[] };
      }>;
    };
  };
  try {
    payload = JSON.parse(textItem.text) as typeof payload;
  } catch {
    throw new Error(
      "Upstream get_amazon_reviews response text was not valid JSON.",
    );
  }
  if (payload.code !== 0) {
    throw new Error(
      `Upstream get_amazon_reviews failed: code=${payload.code ?? "?"} ` +
        `message=${payload.message ?? ""}`,
    );
  }
  const pages = payload.data?.json ?? [];
  const reviews: UpstreamReview[] = [];
  let totalReviews: string | null = null;
  for (const page of pages) {
    if (page.code !== 0) continue;
    if (totalReviews === null && page.data?.totalReviews) {
      totalReviews = page.data.totalReviews;
    }
    for (const r of page.data?.results ?? []) reviews.push(r);
  }
  return {
    asin,
    site,
    totalReviews,
    pointCost:
      typeof payload.pointCost === "number" ? payload.pointCost : null,
    reviews: reviews.map((r) => normalizeReview(r, asin)),
  };
}

/** Live client: MCP bridge to the hosted Pangolinfo MCP server. */
export class McpUpstreamClient implements UpstreamReviewsClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = new Client(
          { name: "pangolinfo-review-mining-mcp", version: "0.1.1" },
          { capabilities: {} },
        );
        const transport = new StreamableHTTPClientTransport(
          new URL(this.url),
          {
            requestInit: {
              headers: { Authorization: `Bearer ${this.apiKey}` },
            },
          },
        );
        await client.connect(transport);
        this.client = client;
        return client;
      })();
    }
    return this.connecting;
  }

  async fetchReviews(args: UpstreamReviewArgs): Promise<ReviewFetchResult> {
    const client = await this.connect();
    const result = await client.callTool({
      name: UPSTREAM_TOOL_NAME,
      arguments: {
        asin: args.asin,
        ...(args.site ? { site: args.site } : {}),
        ...(args.pageCount ? { pageCount: args.pageCount } : {}),
        ...(args.filterByStar ? { filterByStar: args.filterByStar } : {}),
        ...(args.sortBy ? { sortBy: args.sortBy } : {}),
        ...(args.mediaType ? { mediaType: args.mediaType } : {}),
      },
    });
    return parseUpstreamResult(result, args.asin, args.site ?? "amz_us");
  }
}
