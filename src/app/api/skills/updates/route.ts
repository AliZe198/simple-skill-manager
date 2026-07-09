import { handle } from "@/lib/api";
import { checkAllUpdates } from "@/lib/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Check every adopted skill against its upstream for available updates. */
export async function GET() {
  return handle(() => checkAllUpdates());
}
