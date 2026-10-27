#!/usr/bin/env node
/**
 * Pangolinfo Review Mining MCP server (stdio).
 *
 * A differentiated, review-mining-only MCP server. It does NOT duplicate
 * the general Pangolinfo Amazon Data MCP (product search, best sellers,
 * categories, WIPO, SERP, Alexa, ...). Its only upstream dependency is
 * that MCP server's `get_amazon_reviews` tool, reached as an MCP client
 * over Streamable HTTP; all mining analysis runs locally.
 *
 * Configuration (environment only — never put a key in source):
 *   PANGOLINFO_API_KEY         Needed for live tool calls, but NOT for
 *                              startup: without it the server still starts
 *                              and answers initialize and tools/list, and
 *                              live tool calls fail with a clear message
 *                              until the key is set. Bearer token for
 *                              the hosted Pangolinfo MCP server.
 *   PANGOLINFO_MCP_URL         Optional. Defaults to
 *                              https://mcp.pangolinfo.com/mcp
 *   PANGOLINFO_REVIEW_MINING_MOCK=1
 *                              Mock mode: no network, no key. Serves
 *                              canned mocked reviews for tests only.
 *
 * Logging goes to stderr; stdout is reserved for the MCP protocol.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOL_DEFS, handleTool } from "./tools.js";
import { createUpstreamClient } from "./upstream.js";

const MOCK_MODE = process.env.PANGOLINFO_REVIEW_MINING_MOCK === "1";

async function main(): Promise<void> {
  const client = createUpstreamClient();
  const server = new Server(
    { name: "pangolinfo-review-mining-mcp", version: "0.1.2" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await handleTool(
        client,
        name,
        (args ?? {}) as Record<string, unknown>,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[review-mining-mcp] Serving 5 review-mining tools over stdio " +
      `(${MOCK_MODE ? "mock" : "live"} mode).`,
  );
}

main().catch((err: unknown) => {
  console.error(
    "[review-mining-mcp] Fatal:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
