import { NextRequest } from "next/server";
import { handle, fail } from "@/lib/api";
import { getSkillDetail } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash") || "";
  if (!hash) return fail("missing hash");
  return handle(() => getSkillDetail(hash));
}
