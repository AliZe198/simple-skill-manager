import { handle } from "@/lib/api";
import { listTrashedSkills } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => listTrashedSkills());
}
