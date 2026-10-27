/**
 * Stdio smoke test: spawns the real server in mock mode and speaks
 * MCP JSON-RPC over stdin/stdout. No network, no API key.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

interface RpcResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { message: string };
}

function runSmoke(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = new URL("../src/index.js", import.meta.url);
    const child: ChildProcessWithoutNullStreams = spawn(
      process.execPath,
      [serverPath.pathname],
      {
        env: { ...process.env, PANGOLINFO_REVIEW_MINING_MOCK: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("stdio smoke test timed out"));
    }, 20000);
    let buffer = "";
    let nextId = 1;
    const pending = new Map<number, (r: RpcResponse) => void>();
    const send = (method: string, params?: unknown): Promise<RpcResponse> => {
      const id = nextId++;
      return new Promise((res) => {
        pending.set(id, res);
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        );
      });
    };
    const notify = (method: string): void => {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
    };
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as RpcResponse;
        const cb = pending.get(msg.id);
        if (cb) {
          pending.delete(msg.id);
          cb(msg);
        }
      }
    });
    child.stderr.on("data", () => {
      // Server logs to stderr by design; ignore here.
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    (async () => {
      const init = await send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.1.0" },
      });
      assert.ok(init.result, "initialize must return a result");
      notify("notifications/initialized");
      const list = await send("tools/list");
      const tools = (list.result?.tools ?? []) as Array<{ name: string }>;
      const names = tools.map((t) => t.name);
      assert.deepEqual(
        [...names].sort(),
        [
          "get_product_reviews", "mine_complaints", "review_mining_report",
          "review_sentiment_summary", "top_complaint_topics",
        ].sort(),
      );
      const call = await send("tools/call", {
        name: "review_sentiment_summary",
        arguments: { asin: "B0MOCK0001" },
      });
      const content = call.result?.content as
        | Array<{ type: string; text: string }>
        | undefined;
      assert.ok(content && content[0]?.type === "text");
      const first = content[0];
      assert.ok(first);
      const parsed = JSON.parse(first.text) as {
        reviewsAnalyzed: number;
        averageStar: number;
      };
      assert.equal(parsed.reviewsAnalyzed, 8);
      assert.equal(parsed.averageStar, 2.75);
      clearTimeout(timer);
      child.kill();
      resolve();
    })().catch((err: unknown) => {
      clearTimeout(timer);
      child.kill();
      reject(err);
    });
  });
}

test("stdio server answers initialize, tools/list and tools/call in mock mode", runSmoke);

/**
 * Regression test for the MCPVault verification failure: without an API
 * key the server must still start and answer initialize and tools/list,
 * and only live tool calls fail, cleanly, instead of the process
 * crashing at startup (which verifiers report as process_exited_code_1).
 */
function runNoKeySmoke(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = new URL("../src/index.js", import.meta.url);
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.PANGOLINFO_API_KEY;
    delete env.PANGOLINFO_REVIEW_MINING_MOCK;
    const child: ChildProcessWithoutNullStreams = spawn(
      process.execPath,
      [serverPath.pathname],
      { env, stdio: ["pipe", "pipe", "pipe"] },
    );
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("no-key stdio smoke test timed out"));
    }, 20000);
    let buffer = "";
    let nextId = 1;
    const pending = new Map<number, (r: RpcResponse) => void>();
    const send = (method: string, params?: unknown): Promise<RpcResponse> => {
      const id = nextId++;
      return new Promise((res) => {
        pending.set(id, res);
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        );
      });
    };
    const notify = (method: string): void => {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
    };
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as RpcResponse;
        const cb = pending.get(msg.id);
        if (cb) {
          pending.delete(msg.id);
          cb(msg);
        }
      }
    });
    child.stderr.on("data", () => {
      // Server logs to stderr by design; ignore here.
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    (async () => {
      const init = await send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.1.0" },
      });
      assert.ok(init.result, "initialize must return a result without a key");
      const serverInfo = init.result?.serverInfo as
        | { version?: string }
        | undefined;
      assert.equal(serverInfo?.version, "0.1.2");
      notify("notifications/initialized");
      const list = await send("tools/list");
      const tools = (list.result?.tools ?? []) as Array<{ name: string }>;
      assert.equal(tools.length, 5, "tools/list must still return 5 tools");
      const call = await send("tools/call", {
        name: "get_product_reviews",
        arguments: { asin: "B0MOCK0001" },
      });
      assert.equal(
        (call.result as { isError?: boolean } | undefined)?.isError,
        true,
        "live tool call without a key must fail cleanly, not crash",
      );
      const content = call.result?.content as
        | Array<{ type: string; text: string }>
        | undefined;
      assert.ok(
        content?.[0]?.text.includes("PANGOLINFO_API_KEY is not set"),
        "failure message must name the missing key",
      );
      clearTimeout(timer);
      child.kill();
      resolve();
    })().catch((err: unknown) => {
      clearTimeout(timer);
      child.kill();
      reject(err);
    });
  });
}

test(
  "stdio server starts without an API key and fails live calls cleanly",
  runNoKeySmoke,
);
