import { NextRequest } from "next/server";
import { handle, fail } from "@/lib/api";
import {
  syncStatus,
  connectPreview,
  connect,
  backup,
  overwriteCloudWithLocal,
  undoCloudOverwrite,
  pull,
  restoreFromCloud,
  syncCheck,
  disconnect,
  ghLoginStart,
  ghLoginStatus,
  ghLoginCancel,
} from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => syncStatus());
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  const opts = {
    repoUrl: typeof body.repoUrl === "string" ? body.repoUrl : undefined,
    create: body.create === true,
    repoName: typeof body.repoName === "string" ? body.repoName : undefined,
    repoPrivate: body.repoPrivate === false ? false : undefined,
  };
  switch (body.action) {
    case "connectPreview":
      return handle(() => connectPreview(opts));
    case "connect":
      return handle(() => connect(opts));
    case "backup":
      return handle(() => backup());
    case "overwriteCloudWithLocal":
      return handle(() => overwriteCloudWithLocal());
    case "undoCloudOverwrite":
      return handle(() => undoCloudOverwrite());
    case "pull":
      return handle(() => pull());
    case "restoreFromCloud":
      return handle(() => restoreFromCloud());
    case "checkChanges":
      return handle(() => syncCheck());
    case "disconnect":
      return handle(() => disconnect());
    case "ghLoginStart":
      return handle(() => ghLoginStart());
    case "ghLoginStatus":
      return handle(() => ghLoginStatus());
    case "ghLoginCancel":
      return handle(() => ghLoginCancel());
    default:
      return fail(`Unknown action: ${body.action}`);
  }
}
