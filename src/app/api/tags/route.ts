import { NextRequest } from "next/server";
import { handle, fail } from "@/lib/api";
import { loadConfig } from "@/lib/config";
import {
  tagUsage,
  createTag,
  renameTag,
  deleteTag,
  deleteTags,
  setTagOrder,
} from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** All tags in use + counts, plus the user's manual order. */
export async function GET() {
  return handle(() => ({ tags: tagUsage(), order: loadConfig().tagOrder }));
}

/** Global tag management: rename / delete across every skill. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  const action = String(body.action || "");
  if (action === "createTag")
    return handle(() => createTag(String(body.tag || "")));
  // "merge A into B" is just renaming A → B (replace + dedup across skills).
  if (action === "renameTag" || action === "mergeTag")
    return handle(() =>
      renameTag(
        String(body.oldTag || body.from || ""),
        String(body.newTag || body.into || "")
      )
    );
  if (action === "deleteTag")
    return handle(() => deleteTag(String(body.tag || "")));
  if (action === "deleteTags")
    return handle(() =>
      deleteTags(Array.isArray(body.tags) ? body.tags.map(String) : [])
    );
  if (action === "setTagOrder")
    return handle(() =>
      setTagOrder(Array.isArray(body.order) ? body.order.map(String) : [])
    );
  return fail(`Unknown action: ${action}`);
}
