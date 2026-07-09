import { handle } from "@/lib/api";
import { duplicateGroups } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-named, different-content library copies — the dedupe candidates. */
export async function GET() {
  return handle(() => duplicateGroups());
}
