import { NextRequest } from "next/server";
import { handle, fail } from "@/lib/api";
import {
  browseMarketplace,
  installFromMarket,
  installFromRef,
  installFromLocal,
} from "@/lib/marketplace";
import { toggleFavorite } from "@/lib/db";
import type { MarketSkill } from "@/lib/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  return handle(() => browseMarketplace(q));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  const action = String(body.action || "");
  const agentIds = Array.isArray(body.agentIds) ? body.agentIds.map(String) : [];
  if (action === "install") {
    return handle(() => installFromMarket(body.skill as MarketSkill, agentIds));
  }
  if (action === "installGit") {
    return handle(() => installFromRef(String(body.ref || ""), agentIds));
  }
  if (action === "installLocal") {
    return handle(() =>
      installFromLocal(String(body.path || ""), agentIds, {
        batch: body.batch === true,
      })
    );
  }
  if (action === "favorite") {
    return handle(() => {
      toggleFavorite(String(body.marketId), body.on === true);
      return { ok: true };
    });
  }
  return fail(`Unknown action: ${action}`);
}
