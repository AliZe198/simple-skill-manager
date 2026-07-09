import { handle } from "@/lib/api";
import { detectAgents } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => detectAgents());
}
