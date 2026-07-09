import { NextRequest } from "next/server";
import { handle, fail } from "@/lib/api";
import { updateSkill } from "@/lib/marketplace";
import {
  adopt,
  promote,
  moveToLibrary,
  mergeDuplicates,
  revealInFinder,
  importSkill,
  importMany,
  removeFromLibrary,
  createTarget,
  removeTarget,
  syncLocalChange,
  park,
  remove,
  createSkill,
  renameSkill,
  setProvenance,
  setTags,
  buildOverview,
} from "@/lib/library";
import type { Provenance } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single dispatcher for all skill mutations. Each action maps to one
 * library.ts function; every one writes only under the managed roots.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }
  const action = String(body.action || "");
  const hash = typeof body.hash === "string" ? body.hash : "";

  switch (action) {
    case "import": // 导入（自动选择 adopt / promote）
      return handle(() =>
        importSkill(hash, {
          provenance: body.provenance as Provenance | undefined,
        })
      );
    case "importMany": // 批量导入
      return handle(() =>
        importMany(Array.isArray(body.hashes) ? body.hashes.map(String) : [])
      );
    case "removeFromLibrary": // 移出我的库（保留文件，可逆）
      return handle(() => {
        removeFromLibrary(hash);
        return { removed: hash };
      });
    case "adopt": // (legacy) 收入库
      return handle(() =>
        adopt(hash, { provenance: body.provenance as Provenance | undefined })
      );
    case "promote": // (legacy) 复制到我的库
      return handle(() => promote(hash));
    case "moveToLibrary": // 内置技能 → 我的正式技能（可分发）
      return handle(() => moveToLibrary(hash));
    case "mergeDuplicates": // 去重：保留一个，其余 agent 重指向后删除
      return handle(() =>
        mergeDuplicates(
          String(body.keepHash || ""),
          Array.isArray(body.dropHashes) ? body.dropHashes.map(String) : []
        )
      );
    case "updateSkill": // 从上游拉取最新版本，替换库里副本
      return handle(() => updateSkill(hash));
    case "syncLocalChange": // 库里被本地改动后，重新拷贝到各 agent 并更新 hash
      return handle(() => {
        const r = syncLocalChange(hash);
        // After re-key the row lives under the new hash; return that row.
        return r.synced ? findRow(r.newHash as string) : findRow(hash);
      });
    case "reveal": // 在 Finder 打开技能所在文件夹
      return handle(() => revealInFinder(hash));
    case "enable": // 启用 (for an agent)
      return handle(() => {
        createTarget(hash, String(body.agentId));
        return findRow(hash);
      });
    case "disable": // 停用 (for an agent)
      return handle(() => {
        removeTarget(hash, String(body.agentId));
        return findRow(hash);
      });
    case "park": // 暂存
      return handle(() => park(hash));
    case "delete": // 删除
      return handle(() => {
        remove(hash);
        return { deleted: hash };
      });
    case "new": // 新建技能
      return handle(() =>
        createSkill({
          name: String(body.name || "Untitled"),
          description:
            typeof body.description === "string" ? body.description : "",
        })
      );
    case "rename": // 重命名（改 SKILL.md + 文件夹 + 重指向 agent）
      return handle(() => renameSkill(hash, String(body.name || "")));
    case "provenance":
      return handle(() => setProvenance(hash, body.provenance as Provenance));
    case "setTags":
      return handle(() =>
        setTags(hash, Array.isArray(body.tags) ? body.tags.map(String) : [])
      );
    default:
      return fail(`Unknown action: ${action}`);
  }
}

function findRow(hash: string) {
  const row = buildOverview().find((r) => r.contentHash === hash);
  if (!row) throw new Error("Skill not found after operation");
  return row;
}
