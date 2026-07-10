export type Lang = "zh" | "en";

/**
 * Bilingual dictionary (zh default, EN toggle). Terminology per
 * docs/ui-terminology.md v0.4: two identities (未导入/已导入) + a row of
 * per-agent switches; states 使用中/闲置; actions 导入 / 移出我的库 / 彻底删除.
 */
export const DICT = {
  appName: { zh: "技能管理台", en: "Skill Manager" },
  tagline: {
    zh: "把散落在各个 AI 工具里的技能，收拢成一份干净清单",
    en: "Corral skills scattered across your AI tools into one clean list",
  },

  // nav
  nav_library: { zh: "我的库", en: "My Library" },
  nav_discover: { zh: "发现", en: "Discover" },
  nav_workspace: { zh: "按 Agent 看", en: "By Agent" },
  nav_marketplace: { zh: "市场", en: "Marketplace" },
  nav_mcp: { zh: "MCP 总览", en: "MCP Overview" },
  nav_settings: { zh: "设置", en: "Settings" },
  nav_no_agents: { zh: "未检测到 Agent", en: "No agents detected" },

  // actions
  act_import: { zh: "导入", en: "Import" },
  act_import_selected: { zh: "导入选中", en: "Import selected" },
  act_enable: { zh: "启用", en: "Enable" },
  act_disable: { zh: "停用", en: "Disable" },
  act_remove_lib: { zh: "移出我的库", en: "Remove from Library" },
  act_delete_perm: { zh: "彻底删除", en: "Delete permanently" },
  act_move_to_library: { zh: "移动到我的库", en: "Move to My Library" },
  // update checking
  upd_check: { zh: "检查更新", en: "Check updates" },
  upd_checking: { zh: "检查中…", en: "Checking…" },
  upd_available: { zh: "有更新", en: "Update" },
  upd_update: { zh: "更新", en: "Update" },
  upd_from: { zh: "来自", en: "from" },
  upd_done: { zh: "已更新", en: "Updated" },
  upd_overwrite_local_body: {
    zh: "这个技能在库里有未同步的本地改动。更新会用上游版本覆盖这些改动（更新前会自动保留一个本地快照，可恢复）。继续更新？",
    en: "This skill has unsynced local edits in the library. Updating overwrites them with the upstream version (a local snapshot is taken first, so it's recoverable). Continue?",
  },
  // local-change sync (skill edited in place in the library)
  sync_local_badge: { zh: "改动未同步", en: "Unsynced changes" },
  sync_local_hint: {
    zh: "库里的内容改过了，但拷贝模式的 agent 副本还是旧的。点「同步改动」重新拷贝。",
    en: "The library copy was edited, but copy-mode agents still hold the old version. Click “Sync changes” to re-copy.",
  },
  sync_local_btn: { zh: "同步改动", en: "Sync changes" },
  sync_local_done: { zh: "已同步到各 agent", en: "Synced to agents" },
  upd_none: { zh: "都是最新的 ✓", en: "All up to date ✓" },
  upd_found_n: { zh: "个有更新", en: "with updates" },
  act_install: { zh: "安装", en: "Install" },
  act_want: { zh: "想要", en: "Want" },
  act_reveal: { zh: "显示明文", en: "Reveal" },
  act_hide: { zh: "隐藏", en: "Hide" },
  act_cancel: { zh: "取消", en: "Cancel" },
  act_confirm: { zh: "确定", en: "Confirm" },
  act_rename: { zh: "重命名", en: "Rename" },
  act_delete: { zh: "删除", en: "Delete" },
  rename_hint: {
    zh: "会同时改写 SKILL.md 的名字、重命名文件夹，并自动把所有 agent 的链接指过去。",
    en: "Rewrites the SKILL.md name, renames the folder, and re-points every agent's link.",
  },
  rename_done: { zh: "已重命名", en: "Renamed" },
  tagmgr_title: { zh: "🏷️ 标签管理", en: "🏷️ Tag manager" },
  tagmgr_desc: {
    zh: "管理所有用过的标签。重命名、删除或合并会作用到每一个用到它的技能。",
    en: "Manage every tag. Rename, delete or merge applies to every skill that uses it.",
  },
  tagmgr_empty: { zh: "还没有任何标签。在上面「新建标签」，或去技能卡片「＋ 加标签」。", en: "No tags yet. Create one above, or add via “＋ Add tag” on a skill card." },
  tagmgr_no_match: { zh: "没有匹配的标签。", en: "No matching tags." },
  tagmgr_new_ph: { zh: "＋ 新建标签，回车添加", en: "＋ New tag, Enter to add" },
  tagmgr_search_ph: { zh: "🔍 搜索标签", en: "🔍 Search tags" },
  tagmgr_sort_name: { zh: "按名称", en: "By name" },
  tagmgr_sort_count: { zh: "按次数 ↓", en: "By count ↓" },
  tagmgr_sort_manual: { zh: "自定义顺序", en: "Custom order" },
  tagmgr_manual_hint: {
    zh: "💡 用每行左侧的 ▲▼ 调整顺序；这个顺序也会用在技能卡片的「＋ 加标签」里。",
    en: "💡 Use ▲▼ on each row to reorder; this order is also used in “＋ Add tag” on skill cards.",
  },
  tagmgr_move_up: { zh: "上移", en: "Move up" },
  tagmgr_move_down: { zh: "下移", en: "Move down" },
  tagmgr_batch_delete: { zh: "批量删除", en: "Delete selected" },
  tagmgr_hint: {
    zh: "💡 勾选多个标签可「批量删除」；单个标签可「合并到」另一个标签。",
    en: "💡 Check multiple tags to batch-delete; merge a single tag into another.",
  },
  tagmgr_view: { zh: "查看", en: "View" },
  tagmgr_merge: { zh: "合并到…", en: "Merge into…" },
  tagmgr_merge_pick: { zh: "合并到…", en: "Merge into…" },
  tagmgr_n_skills: { zh: "个技能", en: "skill(s)" },
  tagmgr_created: { zh: "标签已新建", en: "Tag created" },
  tagmgr_merged: { zh: "标签已合并", en: "Tags merged" },
  tagmgr_no_skills: { zh: "（暂无技能用到它）", en: "(no skills use it yet)" },
  tagmgr_renamed: { zh: "标签已重命名", en: "Tag renamed" },
  tagmgr_deleted: { zh: "标签已删除", en: "Tag deleted" },
  tagmgr_batch_deleted: { zh: "已批量删除标签", en: "Tags deleted" },
  tagmgr_batch_delete_confirm: {
    zh: "删除选中的 {n} 个标签？会从相应技能上移除它们。",
    en: "Delete the {n} selected tag(s)? They'll be removed from the skills using them.",
  },
  tagmgr_delete_confirm: {
    zh: "删除标签「{tag}」？会从 {n} 个技能上移除它。",
    en: "Delete tag “{tag}”? It will be removed from {n} skill(s).",
  },
  act_refresh: { zh: "重新扫描", en: "Rescan" },
  act_retry: { zh: "重试", en: "Retry" },

  // provenance
  prov_self: { zh: "我写的", en: "Self-authored" },
  prov_downloaded: { zh: "下载的", en: "Downloaded" },
  prov_bundled: { zh: "内置", en: "Built-in" },
  prov_unknown: { zh: "未分类", en: "Unclassified" },
  // Discover "built-in" tab + per-card agent-specific suffix ("Codex 内置").
  builtin_tab: { zh: "Agent 内置", en: "Built-in" },
  builtin_suffix: { zh: "内置", en: "built-in" },
  lbl_builtin_of: { zh: "属于哪个 Agent", en: "Built-in of" },
  // My Library zones: my own skills vs agent-bundled (quarantined) skills.
  zone_mine: { zh: "我的技能", en: "My skills" },
  // dedupe
  dedup_title: { zh: "重复技能", en: "Duplicate skills" },
  dedup_hint: {
    zh: "同名但内容不同的多份（之前不同 agent 装了不同版本）。选一个保留，其余 agent 会自动重指向它、然后删除。",
    en: "Same name, different content (different agents had different versions). Keep one; the others' agents get re-pointed to it, then removed.",
  },
  dedup_merge: { zh: "合并", en: "Merge" },
  dedup_merged: { zh: "已合并", en: "Merged" },
  dedup_files: { zh: "个文件", en: "files" },
  dedup_fullest: { zh: "最全", en: "fullest" },
  dedup_open_finder: { zh: "在 Finder 打开", en: "Open in Finder" },
  lbl_belongs_to: { zh: "属于", en: "Belongs to" },
  zone_builtin_hint: {
    zh: "这些是 agent 自带的技能，默认只留给原 agent、不会分发给其他 agent。点「移动到我的库」才会变成你的、可分发的技能。",
    en: "These ship with the agent — kept for it and not shared with your other agents. Click “Move to My Library” to make one yours and distributable.",
  },
  lbl_no_builtin: {
    zh: "还没有导入的 Agent 内置技能。去「发现」里导入吧。",
    en: "No imported agent-built-in skills yet. Import some from Discover.",
  },

  // identity / state
  lbl_imported: { zh: "已导入", en: "Imported" },
  lbl_not_imported: { zh: "未导入", en: "Not imported" },
  lbl_active: { zh: "使用中", en: "In use" },
  lbl_idle: { zh: "闲置", en: "Idle" },
  lbl_appears_in: { zh: "出现在", en: "Appears in" },
  lbl_use_in: { zh: "用在", en: "Use in" },
  lbl_all: { zh: "全部", en: "All" },
  lbl_selected: { zh: "已选", en: "Selected" },
  lbl_select_all: { zh: "全选", en: "Select all" },
  lbl_search: { zh: "搜索技能…", en: "Search skills…" },
  lbl_no_skills: { zh: "这里还没有技能", en: "No skills here yet" },
  lbl_no_discover: {
    zh: "没有未导入的技能 —— 都收拾干净了 🎉",
    en: "Nothing left to import — all tidy 🎉",
  },
  lbl_discover_empty_machine: {
    zh: "还没发现任何技能。装了 AI 工具的技能后会自动出现在这里，或去「市场」安装。",
    en: "No skills found yet. They'll show up here once your AI tools have some, or install from the Marketplace.",
  },
  lbl_detected: { zh: "已检测到", en: "Detected" },
  lbl_not_detected: { zh: "未检测到", en: "Not detected" },
  agent_ignore: { zh: "忽略", en: "Ignore" },
  agent_ignore_hint: {
    zh: "隐藏这个 Agent（已卸载 / 不用了）",
    en: "Hide this agent (uninstalled / unused)",
  },
  agent_ignored_title: { zh: "已忽略的 Agent", en: "Ignored agents" },
  agent_unignore: { zh: "恢复", en: "Restore" },
  agent_unignored: { zh: "已恢复", en: "Restored" },
  agent_ignored: { zh: "已忽略", en: "Ignored" },
  agent_ignore_body: {
    zh: "把「{name}」从侧栏和技能分发里隐藏，不再向它分发技能（可随时恢复）。\n\n它残留目录里已经分发过的技能要怎么处理？",
    en: "Hide “{name}” from the sidebar and distribution; stop sending skills to it (reversible).\n\nWhat about the skills already distributed into its leftover dir?",
  },
  agent_ignore_hide_only: { zh: "仅隐藏", en: "Hide only" },
  agent_ignore_clean: { zh: "隐藏并清理残留", en: "Hide & clean up" },
  lbl_link_mode: { zh: "链接方式", en: "Link mode" },
  lbl_symlink: { zh: "软链接", en: "Symlink" },
  lbl_copy: { zh: "拷贝", en: "Copy" },
  lbl_missing_in: { zh: "库里有但未启用", en: "In library, not enabled" },

  // discover page — suite grouping (skills installed together from one repo)
  suite_badge: { zh: "套件", en: "Suite" },
  suite_sub: {
    zh: "来自同一个仓库、一起安装的技能",
    en: "Skills installed together from one repo",
  },
  suite_select_all: { zh: "全选这组", en: "Select suite" },
  act_import_suite: { zh: "导入整组", en: "Import suite" },
  suite_loose_title: { zh: "独立技能", en: "Standalone skills" },

  // discover page
  discover_intro: {
    zh: "在你的 agent 里扫到、还没导入的技能。导入你想管起来的；同一个技能在多个 agent 出现会自动合并成一条。",
    en: "Skills found across your agents, not yet imported. Import the ones you want to manage; the same skill found in multiple agents is merged into one row.",
  },

  // mcp
  mcp_readonly: {
    zh: "只读视图 · 本工具不会修改任何 MCP 配置",
    en: "Read-only · this tool never edits MCP configs",
  },
  mcp_by_agent: { zh: "按 Agent 看", en: "By Agent" },
  mcp_by_server: { zh: "按 MCP 反查", en: "By Server" },
  mcp_no_config: { zh: "未找到配置文件", en: "No config file found" },
  mcp_disabled: { zh: "已停用", en: "disabled" },

  // settings
  set_lang: { zh: "语言", en: "Language" },
  set_paths: { zh: "路径与链接方式", en: "Paths & Link Mode" },
  set_agent_root: { zh: "Agent 根目录", en: "Agent root" },
  set_data_dir: { zh: "中央库目录", en: "Library data dir" },
  set_linkmode_hint: {
    zh: "Kimi 疑似不认软链，默认用拷贝。请在 Agent 唤醒后实测确认。",
    en: "Kimi likely ignores symlinks; defaults to copy. Verify per-agent when awake.",
  },
  set_probe: { zh: "链接方式自检", en: "Link mode" },
  set_probe_hint: {
    zh: "自检需要实际运行对应 Agent 才能确认，请手动设置每个 Agent 的链接方式。",
    en: "A true probe requires running each agent; set link mode manually here.",
  },
  set_env_hint: {
    zh: "通过环境变量 SSM_AGENT_ROOT 与 SSM_DATA_DIR 可把整个工具指向任意目录（测试 / 沙箱用）。",
    en: "Env vars SSM_AGENT_ROOT and SSM_DATA_DIR re-point the whole tool at any directory (for testing / sandboxing).",
  },
  linkmode_note: {
    zh: "切换会立即把该 Agent 现有的分发重写为新方式。这是手动覆盖，不能替代实测。",
    en: "Switching rewrites this agent's existing targets to the new mode. Manual override — not a substitute for actually testing the agent.",
  },

  // per-agent path / config overrides
  agent_cfg_title: { zh: "目录与配置", en: "Paths & config" },
  agent_dir: { zh: "目录", en: "Directory" },
  agent_dir_edit_hint: {
    zh: "手动检查 / 修改这个 Agent 的技能目录与 MCP 配置（自动检测指错时用）",
    en: "Manually check / edit this agent's skills dir & MCP config (when auto-detection is wrong)",
  },
  agent_dir_title: { zh: "技能目录", en: "Skills directory" },
  agent_mcp_section: { zh: "MCP 配置文件", en: "MCP config file" },
  agent_mcp_desc: {
    zh: "这个 Agent 的 MCP 配置文件（相对 Agent 根目录）及解析格式。例如 Kimi Code 的 MCP 在 .kimi-code/config.toml（TOML），而不是旧版的 .kimi/mcp.json。",
    en: "This agent's MCP config file (relative to the agent root) and how to parse it. E.g. Kimi Code keeps MCP in .kimi-code/config.toml (TOML), not the legacy .kimi/mcp.json.",
  },
  agent_mcp_path_label: {
    zh: "配置文件路径（相对 Agent 根目录）",
    en: "Config file (relative to agent root)",
  },
  agent_mcp_format_label: { zh: "解析格式", en: "Format" },
  agent_mcp_found: { zh: "✓ 文件存在", en: "✓ File exists" },
  agent_mcp_notfound: {
    zh: "✗ 没找到这个文件（可能还没配 MCP，留空即可）",
    en: "✗ File not found (maybe no MCP configured yet — fine to leave it)",
  },
  agent_mcp_note: {
    zh: "💡 MCP 视图是只读的，这里只改「从哪读」，不会动 Agent 的配置文件。",
    en: "💡 The MCP view is read-only — this only changes where we read from, never writes the agent's config.",
  },
  agent_mcp_saved: { zh: "已更新 MCP 配置", en: "MCP config updated" },
  agent_dir_desc: {
    zh: "这个 Agent 的技能目录（相对 Agent 根目录）。例如 Kimi Code 实际在 .kimi-code/skills，而不是旧版的 .kimi/skills。",
    en: "This agent's skills dir (relative to the agent root). E.g. Kimi Code actually lives in .kimi-code/skills, not the legacy .kimi/skills.",
  },
  agent_dir_input_label: {
    zh: "技能目录（相对 Agent 根目录）",
    en: "Skills dir (relative to agent root)",
  },
  agent_dir_check: { zh: "检查", en: "Check" },
  agent_dir_found: { zh: "✓ 目录存在", en: "✓ Directory exists" },
  agent_dir_notfound: {
    zh: "✗ 没找到这个目录（保存后会在首次分发时自动创建）",
    en: "✗ Directory not found (it will be created on first distribution)",
  },
  agent_dir_save_note: {
    zh: "💡 只改指向，已经发到旧目录里的技能不会自动搬过去 —— 需要的话从工作台重新分发。",
    en: "💡 Re-points detection only; skills already in the old dir aren't moved — re-distribute from the workspace if needed.",
  },
  agent_dir_reset: { zh: "恢复默认", en: "Reset to default" },
  agent_dir_saved: { zh: "已更新目录", en: "Directory updated" },

  // safety banner
  banner_real: { zh: "真实机器", en: "REAL MACHINE" },
  banner_sandbox: { zh: "沙箱（假数据）", en: "SANDBOX (fake data)" },
  banner_real_desc: {
    zh: "正在操作你真实的 Agent 目录，所有改动会落到真实文件",
    en: "Operating on your real agent dirs — every change hits real files",
  },
  banner_sandbox_desc: {
    zh: "指向沙箱目录，随便点，不会动你的真实文件",
    en: "Pointed at a sandbox — safe to click around, real files untouched",
  },
  banner_dismiss: { zh: "关闭（下次运行会再出现）", en: "Dismiss (returns next run)" },

  // error / retry
  err_load: { zh: "加载失败", en: "Failed to load" },

  // confirm dialogs
  confirm_remove_title: { zh: "移出我的库", en: "Remove from Library" },
  confirm_remove_body: {
    zh: "退出统一管理，但会在用到它的 Agent 里保留一份真实副本（不删文件）。之后可重新导入。",
    en: "Stops managing it, but leaves a real copy in the agents that used it (files kept). You can re-import later.",
  },
  confirm_delete_title: { zh: "彻底删除", en: "Delete permanently" },
  confirm_delete_body: {
    zh: "删除中央库副本，并移除所有 Agent 上的分发。无法撤销。",
    en: "Deletes the library copy and removes it from all agents. Cannot be undone.",
  },

  // detail preview
  lbl_files: { zh: "文件", en: "Files" },
  lbl_path: { zh: "路径", en: "Path" },
  lbl_no_preview: { zh: "没有可预览的内容", en: "Nothing to preview" },
  lbl_view_detail: { zh: "查看详情", en: "View details" },
  detail_source: { zh: "来源", en: "Source" },
  detail_rendered: { zh: "渲染", en: "Rendered" },
  detail_raw: { zh: "原文", en: "Raw" },
  lbl_expand: { zh: "展开", en: "Show more" },
  lbl_collapse: { zh: "收起", en: "Show less" },
  act_copy: { zh: "复制", en: "Copy" },
  act_copied: { zh: "已复制", en: "Copied" },

  // tags
  lbl_tags: { zh: "标签", en: "Tags" },
  tag_add: { zh: "加标签", en: "Add tag" },
  tag_custom_ph: { zh: "自定义标签，回车添加", en: "Custom tag, Enter to add" },
  lbl_filter_tag: { zh: "按标签筛", en: "Filter by tag" },
  lbl_uncategorized: { zh: "未分类", en: "Uncategorized" },
  layout_top: { zh: "顶部标签", en: "Top tags" },
  layout_side: { zh: "侧栏标签", en: "Tag sidebar" },

  // GitHub backup & sync
  sync_title: { zh: "GitHub 备份与同步", en: "GitHub Backup & Sync" },
  sync_desc: {
    zh: "把技能库备份到一个私有 GitHub 仓库，并在多台机器间同步。各机器「哪个 agent 用哪个技能」不同步、各自决定。",
    en: "Back up your library to a private GitHub repo and sync across machines. Per-machine agent assignments are not synced.",
  },
  sync_connected: { zh: "已连接", en: "Connected" },
  sync_not_connected: { zh: "未连接", en: "Not connected" },
  sync_connect: { zh: "连接到已有仓库", en: "Connect existing repo" },
  sync_repo_input_ph: { zh: "owner/repo 或仓库链接", en: "owner/repo or repo URL" },
  sync_create_new: {
    zh: "没有仓库？新建一个",
    en: "No repo? Create one",
  },
  sync_confirm_push_empty: {
    zh: "远端仓库为空，将把本机技能推送上去：",
    en: "The remote repo is empty; your skills will be pushed up:",
  },
  sync_confirm_merge: {
    zh: "本机与云端都有技能，将尝试合并；相同技能自动合并，若有冲突会中止并保护本地文件：",
    en: "Both local and cloud have skills; identical ones merge automatically, conflicts abort safely:",
  },
  sync_repo_public_warn: {
    zh: "⚠️ 该仓库是公开的，技能内容会公开可见",
    en: "⚠️ This repo is public — skill contents will be publicly visible",
  },
  sync_repo_empty: { zh: "空仓库", en: "empty" },
  sync_backup: { zh: "立即备份", en: "Back up now" },
  sync_backup_confirm: {
    zh: "把本地技能库上传到云端备份（本地 → 云端）。这是安全操作——只上传，不会改动你本地的任何文件。继续？",
    en: "Upload your local skill library to the cloud backup (local → cloud). This is safe — it only uploads and never changes your local files. Continue?",
  },
  sync_pull: { zh: "从云端同步", en: "Sync from cloud" },
  sync_pull_confirm: {
    zh: "把云端的改动合并到本地（云端 → 本地，合并）。会保留你本地已有的改动。继续？",
    en: "Merge cloud changes into local (cloud → local, merge). Your local changes are kept. Continue?",
  },
  sync_check: { zh: "检查改动", en: "Check changes" },
  sync_check_hint: { zh: "看本地有没有改动要备份到云端", en: "Check if local has changes to back up" },
  sync_backup_hint: { zh: "本地 → 云端 · 只上传，最安全", en: "Local → cloud · upload only, safe" },
  sync_pull_hint: { zh: "云端 → 本地 · 合并，保留本地", en: "Cloud → local · merge, keeps local" },
  sync_restore_hint: { zh: "云端 → 本地 · ⚠ 覆盖本地改动", en: "Cloud → local · ⚠ overwrites local" },
  sync_disconnect_hint: { zh: "解除与该仓库的关联（不删本地文件）", en: "Unlink this repo (keeps local files)" },
  sync_check_uptodate: {
    zh: "✅ 本地与云端一致，无需备份。",
    en: "✅ Local matches the cloud — nothing to back up.",
  },
  sync_check_needs_backup: {
    zh: "● 有 {n} 处本地改动还没备份 —— 点「⬆ 立即备份」上传。",
    en: "● {n} local change(s) not backed up — click “⬆ Back up now”.",
  },
  sync_check_behind: {
    zh: "⬇ 云端有 {n} 个你还没有的更新 —— 点「从云端同步」拉取。",
    en: "⬇ {n} cloud update(s) you don't have — click “Sync from cloud”.",
  },
  sync_restore: { zh: "恢复到云端版本", en: "Restore from cloud" },
  sync_restore_confirm: {
    zh: "这会丢弃本地改动，强制恢复成云端最新版本（恢复前会自动留一个本地还原点）。确定吗？",
    en: "This discards local changes and force-restores the cloud version (a local restore point is kept first). Continue?",
  },
  sync_restored: { zh: "已恢复到云端版本", en: "Restored from cloud" },
  sync_disconnect: { zh: "断开", en: "Disconnect" },
  sync_last: { zh: "上次同步", en: "Last sync" },
  sync_skills_n: { zh: "个技能已纳入备份", en: "skills backed up" },
  sync_gh_missing: {
    zh: "还没连接 GitHub。点下面的按钮，用浏览器登录授权即可——无需终端命令。",
    en: "GitHub not connected yet. Click below to sign in via your browser — no terminal needed.",
  },
  // Browser (device-flow) login
  sync_gh_login: { zh: "用浏览器登录 GitHub", en: "Sign in with browser" },
  sync_gh_login_busy: { zh: "正在启动…", en: "Starting…" },
  sync_gh_code: { zh: "一次性验证码", en: "One-time code" },
  sync_gh_code_hint: {
    zh: "复制这个验证码，在打开的 GitHub 页面里粘贴并授权。",
    en: "Copy this code, then paste it on the GitHub page that opened and authorize.",
  },
  sync_gh_open: { zh: "打开 GitHub 授权页", en: "Open GitHub page" },
  sync_gh_copy: { zh: "复制验证码", en: "Copy code" },
  sync_gh_copied: { zh: "已复制", en: "Copied" },
  sync_gh_waiting: {
    zh: "等待你在浏览器中完成授权…",
    en: "Waiting for you to authorize in the browser…",
  },
  sync_gh_success: { zh: "GitHub 已登录连接 ✓", en: "Signed in to GitHub ✓" },
  sync_gh_failed: {
    zh: "登录未完成或已过期，请重试。",
    en: "Login didn't complete or expired — try again.",
  },
  sync_gh_cancel: { zh: "取消登录", en: "Cancel" },
  // Create-new repo options
  sync_repo_name_ph: { zh: "新仓库名（默认 my-skills）", en: "New repo name (default my-skills)" },
  sync_repo_private: { zh: "私有", en: "Private" },
  sync_repo_public: { zh: "公开", en: "Public" },
  sync_create_btn: { zh: "新建并连接", en: "Create & connect" },
  sync_imported_n: { zh: "已从云端导入", en: "imported from cloud" },
  sync_confirm_title: { zh: "连接 GitHub", en: "Connect GitHub" },
  sync_repo_new: { zh: "将新建（私有）", en: "will create (private)" },
  sync_repo_exists: { zh: "已存在", en: "exists" },
  sync_confirm_create: {
    zh: "将新建私有仓库，并把你的技能备份上去：",
    en: "Will create a private repo and back up your skills:",
  },
  sync_confirm_clone: {
    zh: "云端已有此仓库，将拉取到本机：",
    en: "This repo already exists on the cloud; it will be pulled to this machine:",
  },
  sync_will_backup: { zh: "将备份", en: "Will back up" },
  sync_skills_unit: { zh: "个技能", en: "skills" },

  // marketplace source hints
  mkt_starter: {
    zh: "输入关键词，搜索 GitHub 上带 SKILL.md 的技能",
    en: "Type to search GitHub for skills (SKILL.md)",
  },
  mkt_github: { zh: "来自 GitHub 搜索（兜底）", en: "from GitHub search (fallback)" },
  mkt_skillssh: { zh: "来自 skills.sh · 按下载量排序", en: "from skills.sh · ranked by installs" },
  mkt_offline: { zh: "离线 · 内置精选目录", en: "offline · built-in catalog" },
  // tabs
  mkt_tab_browse: { zh: "浏览榜单", en: "Browse" },
  mkt_tab_git: { zh: "Git 安装", en: "Git install" },
  mkt_tab_local: { zh: "本地安装", en: "Local install" },
  // git install
  mkt_git_ph: { zh: "owner/repo 或 git 链接（可带子路径）", en: "owner/repo or git URL (optional subpath)" },
  mkt_git_hint: {
    zh: "从 GitHub 仓库直接安装一个技能。会自动定位仓库里的 SKILL.md。",
    en: "Install a skill straight from a GitHub repo. Locates the SKILL.md automatically.",
  },
  // local install
  mkt_local_ph: { zh: "本地文件夹或 .zip / .skill 的绝对路径", en: "Absolute path to a folder or .zip / .skill" },
  mkt_local_hint: {
    zh: "从本地导入。可以是一个技能文件夹、一个 .zip/.skill 压缩包。",
    en: "Import from disk: a skill folder, or a .zip/.skill archive.",
  },
  mkt_local_batch: { zh: "批量：导入文件夹里的所有技能", en: "Batch: import every skill in the folder" },
  mkt_installed_n: { zh: "已安装", en: "Installed" },
  mkt_downloads: { zh: "下载", en: "installs" },
  mkt_view_source: { zh: "在 GitHub 查看来源", en: "View source on GitHub" },
  mkt_ratelimited: {
    zh: "GitHub 代码搜索被限流了（约 10 次/分钟）。稍等一会儿再搜——重复的搜索词会走缓存、不耗额度。",
    en: "GitHub code search is rate-limited (~10/min). Wait a moment — repeated queries are cached and don't use quota.",
  },
  toast_done: { zh: "完成", en: "Done" },
  toast_error: { zh: "出错了", en: "Something went wrong" },
  toast_imported_n: { zh: "已导入", en: "Imported" },
} as const;

export type DictKey = keyof typeof DICT;

export function t(key: DictKey, lang: Lang): string {
  const entry = DICT[key];
  return entry ? entry[lang] : key;
}
