import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { readAllMcp, maskServer } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only MCP overview. env is masked by default; pass ?reveal=agentId:server
 * to return the real env for exactly one server (UI "click to reveal").
 */
export async function GET(req: NextRequest) {
  const reveal = req.nextUrl.searchParams.get("reveal") || "";
  return handle(() => {
    const all = readAllMcp();
    return all.map((entry) => ({
      ...entry,
      servers: entry.servers.map((s) =>
        `${s.agentId}:${s.name}` === reveal ? { ...s, raw: undefined } : maskServer(s)
      ),
    }));
  });
}
