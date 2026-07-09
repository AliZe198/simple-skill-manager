"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher, swrOpts, apiPost, orderTagNames } from "@/lib/client";
import { useLang } from "./LangProvider";
import { useToast } from "./Toast";
import { Button } from "./ui";

interface TagRow {
  tag: string;
  count: number;
  skills: string[];
}

/**
 * Settings tag manager — 方案A (enhanced settings card): create, search, sort,
 * batch-select/delete, merge, view-skills, rename, delete. Everything global
 * (applies across every skill that uses the tag).
 */
export function TagManager() {
  const { t } = useLang();
  const toast = useToast();
  const { data, mutate } = useSWR<{ tags: TagRow[]; order: string[] }>(
    "/api/tags",
    fetcher,
    swrOpts
  );
  const tags = data?.tags ?? [];

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"count" | "name" | "manual">("count");
  const [newTag, setNewTag] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ tag: string; value: string } | null>(
    null
  );
  const [merging, setMerging] = useState<{ tag: string; into: string } | null>(
    null
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const order = data?.order ?? [];
  // Reordering only makes sense over the full, unfiltered list.
  const manualMode = sort === "manual" && !q.trim();

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = tags.filter((r) => r.tag.toLowerCase().includes(needle));
    if (sort === "name")
      return [...list].sort((a, b) => a.tag.localeCompare(b.tag));
    if (sort === "manual") {
      const byTag = new Map(list.map((r) => [r.tag, r]));
      return orderTagNames(
        list.map((r) => r.tag),
        order
      ).map((t) => byTag.get(t)!);
    }
    return list; // count (API default)
  }, [tags, q, sort, order]);

  // Optimistically reorder, persist, then revalidate — instant feedback, no flicker.
  async function reorder(newOrder: string[]) {
    if (!data) return;
    try {
      await mutate(
        async () => {
          await apiPost("/api/tags", { action: "setTagOrder", order: newOrder });
          return { tags: data.tags, order: newOrder };
        },
        {
          optimisticData: { tags: data.tags, order: newOrder },
          rollbackOnError: true,
          revalidate: true,
        }
      );
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  // Move a row up/down within the full manual order and persist the new sequence.
  function move(i: number, dir: -1 | 1) {
    const names = shown.map((r) => r.tag);
    const j = i + dir;
    if (j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    reorder(names);
  }

  async function run(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      await apiPost("/api/tags", body);
      toast(okMsg, "success");
      await mutate();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      setEditing(null);
      setMerging(null);
    }
  }

  function toggle(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setter(n);
  }

  function createNew() {
    const name = newTag.trim();
    if (!name) return;
    setNewTag("");
    run({ action: "createTag", tag: name }, t("tagmgr_created"));
  }

  function batchDelete() {
    const arr = [...selected];
    if (!arr.length) return;
    if (
      !window.confirm(
        t("tagmgr_batch_delete_confirm").replace("{n}", String(arr.length))
      )
    )
      return;
    setSelected(new Set());
    run({ action: "deleteTags", tags: arr }, t("tagmgr_batch_deleted"));
  }

  const actionBtn =
    "text-ink-secondary hover:text-mint-active disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      {/* toolbar: new tag (left, grows) + search / sort / batch-delete (right) */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input min-w-0 flex-1 text-sm"
          placeholder={t("tagmgr_new_ph")}
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createNew();
          }}
        />
        <input
          className="input w-36 text-sm"
          placeholder={t("tagmgr_search_ph")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded-pill border-2 border-line/40 bg-content px-3 py-[7px] text-xs font-bold text-ink-body"
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as "count" | "name" | "manual")
          }
        >
          <option value="count">{t("tagmgr_sort_count")}</option>
          <option value="name">{t("tagmgr_sort_name")}</option>
          <option value="manual">{t("tagmgr_sort_manual")}</option>
        </select>
        <Button
          variant="danger"
          disabled={busy || selected.size === 0}
          onClick={batchDelete}
        >
          🗑 {t("tagmgr_batch_delete")} ({selected.size})
        </Button>
      </div>

      <p className="rounded-bubble bg-amber-50 px-3 py-2 text-xs text-amber-700">
        {sort === "manual" ? t("tagmgr_manual_hint") : t("tagmgr_hint")}
      </p>

      {tags.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("tagmgr_empty")}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("tagmgr_no_match")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shown.map((row, i) => (
            <div
              key={row.tag}
              className="rounded-card border-2 border-line/20 bg-content/40"
            >
              <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                {manualMode && (
                  <div className="flex flex-col leading-none text-ink-disabled">
                    <button
                      className="px-1 hover:text-mint-active disabled:opacity-30"
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                      title={t("tagmgr_move_up")}
                      aria-label={t("tagmgr_move_up")}
                    >
                      ▲
                    </button>
                    <button
                      className="px-1 hover:text-mint-active disabled:opacity-30"
                      disabled={busy || i === shown.length - 1}
                      onClick={() => move(i, 1)}
                      title={t("tagmgr_move_down")}
                      aria-label={t("tagmgr_move_down")}
                    >
                      ▼
                    </button>
                  </div>
                )}
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-mint"
                  checked={selected.has(row.tag)}
                  onChange={() => toggle(selected, row.tag, setSelected)}
                />

                {editing?.tag === row.tag ? (
                  <>
                    <input
                      className="input min-w-0 flex-1 text-sm"
                      autoFocus
                      value={editing.value}
                      onChange={(e) =>
                        setEditing({ tag: row.tag, value: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          run(
                            {
                              action: "renameTag",
                              oldTag: row.tag,
                              newTag: editing.value,
                            },
                            t("tagmgr_renamed")
                          );
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                    <Button
                      variant="primary"
                      disabled={busy || !editing.value.trim()}
                      onClick={() =>
                        run(
                          {
                            action: "renameTag",
                            oldTag: row.tag,
                            newTag: editing.value,
                          },
                          t("tagmgr_renamed")
                        )
                      }
                    >
                      {t("act_confirm")}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      {t("act_cancel")}
                    </Button>
                  </>
                ) : merging?.tag === row.tag ? (
                  <>
                    <span className="badge bg-mint-light text-mint-active">
                      #{row.tag}
                    </span>
                    <span className="text-xs text-ink-muted">→</span>
                    <select
                      className="rounded-pill border-2 border-line/40 bg-content px-3 py-1 text-xs font-bold text-ink-body"
                      value={merging.into}
                      onChange={(e) =>
                        setMerging({ tag: row.tag, into: e.target.value })
                      }
                    >
                      <option value="">{t("tagmgr_merge_pick")}</option>
                      {tags
                        .filter((x) => x.tag !== row.tag)
                        .map((x) => (
                          <option key={x.tag} value={x.tag}>
                            #{x.tag}
                          </option>
                        ))}
                    </select>
                    <Button
                      variant="primary"
                      disabled={busy || !merging.into}
                      onClick={() =>
                        run(
                          { action: "mergeTag", from: row.tag, into: merging.into },
                          t("tagmgr_merged")
                        )
                      }
                    >
                      {t("act_confirm")}
                    </Button>
                    <Button variant="ghost" onClick={() => setMerging(null)}>
                      {t("act_cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="badge bg-mint-light text-mint-active">
                      #{row.tag}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {row.count} {t("tagmgr_n_skills")}
                    </span>
                    <div className="ml-auto flex flex-wrap gap-3 text-xs font-bold">
                      <button
                        className={actionBtn}
                        disabled={busy}
                        onClick={() => toggle(expanded, row.tag, setExpanded)}
                      >
                        👁 {t("tagmgr_view")}
                      </button>
                      <button
                        className={actionBtn}
                        disabled={busy}
                        onClick={() =>
                          setEditing({ tag: row.tag, value: row.tag })
                        }
                      >
                        ✏️ {t("act_rename")}
                      </button>
                      <button
                        className={actionBtn}
                        disabled={busy || tags.length < 2}
                        onClick={() => setMerging({ tag: row.tag, into: "" })}
                      >
                        🔀 {t("tagmgr_merge")}
                      </button>
                      <button
                        className="text-status-error hover:underline disabled:opacity-50"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              t("tagmgr_delete_confirm")
                                .replace("{tag}", row.tag)
                                .replace("{n}", String(row.count))
                            )
                          )
                            return;
                          run(
                            { action: "deleteTag", tag: row.tag },
                            t("tagmgr_deleted")
                          );
                        }}
                      >
                        🗑 {t("act_delete")}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {expanded.has(row.tag) && (
                <div className="border-t border-line/20 px-3 py-2 text-xs">
                  {row.skills.length === 0 ? (
                    <span className="text-ink-muted">{t("tagmgr_no_skills")}</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {row.skills.map((s) => (
                        <span key={s} className="badge bg-white/70 text-ink-body">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
