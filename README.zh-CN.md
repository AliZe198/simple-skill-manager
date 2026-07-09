[English](README.md) | **中文**

# 技能管理台 · Simple Skill Manager

把散落在各个 AI 工具（Claude Code / Codex / Gemini CLI / OpenClaw / Kimi …，自动识别 13 种 Agent）里的
skill，收拢成**一份去重、按来源分类的干净清单**，点一下决定哪个 Agent 能用，并提供
MCP 配置的**只读总览**。

完全本地运行、无云端、无账号。界面默认英文，右上角可切中文（选择会被记住）。

## 功能

- **自动检测已安装的 Agent**（13 个适配器），扫描各自的 skill 目录
- **内容哈希去重** —— 同内容不同名合成一行；同名不同内容当成两个，绝不静默合并
- **中央库** —— 收入库一次，每个 Agent 得到一个软链（不认软链的 Agent 用拷贝）
- **按 Agent 启用 / 停用** —— 点头像即可
- **暂存区** —— 留在库里、暂不分发给任何 Agent
- **重复合并、安全重命名、标签** —— 重命名会同时改文件夹、`name:` 字段和所有 Agent 链接
- **检查更新** —— 只认显式记录了 `git_url` 来源的 skill；本地手写的绝不误动
- **GitHub 备份与多机同步** —— 备份到你自己的私有仓库；破坏性操作前自动留本地 git 快照
- **市场** —— 浏览并安装 skills.sh 上的 skill（离线有内置目录）
- **MCP 总览** —— 只读展示 JSON / TOML / YAML 各格式的 MCP 配置，密钥默认打码

## 安全机制

首次打开只做**只读扫描，不动任何文件**。之后工具永远只写这两个根目录之内：

| 环境变量 | 含义 | 默认 |
|---|---|---|
| `SSM_AGENT_ROOT` | 扫描 / 改动的 agent 目录根 | 真实 `$HOME` |
| `SSM_DATA_DIR` | 中央库 + SQLite + 配置所在 | `~/.simple-skill-manager` |

写出根目录之外会被拒绝（realpath 校验，软链逃逸也挡）。同名但**不归本工具管理**的 skill 绝不覆盖——你手写的文件是安全的。

## 快速开始（macOS / Linux）

需要 **Node.js 18+**。

```bash
./start.sh              # 生产模式：构建并启动，指向你真实 $HOME（端口 3000）
./start.sh --sandbox    # 沙箱模式：先安全试玩，假数据、不碰真实文件（端口 3210）

./dev.sh                # 开发模式：免构建、改代码自动刷新（端口 3000）
./dev.sh --sandbox      # 开发模式 + 沙箱假数据（端口 3210）

./stop.sh               # 停掉正在运行的服务
```

`PORT=4000 ./start.sh` 可指定端口。

**推荐第一步先跑沙箱。** 这个工具会移动 / 软链 / 拷贝 / 删除 Agent 目录里的文件，
先在假目录树里把玩（`--sandbox`），确认行为后再指向真实 `$HOME`。

> `dev.sh` 和 `start.sh` 的区别：`dev.sh` 改代码自动热刷新；`start.sh` 伺服的是启动那一刻的构建，
> 改完代码必须 `./stop.sh && ./start.sh` 重来才生效。

## 快速开始（Windows）

`.sh` 脚本只能在 Git Bash / WSL 里跑；原生 PowerShell 或 cmd 直接用 npm 命令：

```powershell
npm install     # 会装原生 better-sqlite3（通常有预编译包）
npm run build
npm run start   # → http://localhost:3000（扫描你真实的 %USERPROFILE%）
# 想边改边看（热刷新）：npm run dev
```

> **Windows 软链权限**：建软链需要开发者模式（设置 → 隐私和安全性 → 开发者选项）或管理员终端。
> 不想开也行：到设置页把对应 Agent 切成**拷贝模式**，无需任何权限。

## 手动进沙箱

```bash
node scripts/build-sandbox.mjs        # 在 .ssm-sandbox/ 造一棵假的 agent 目录树
SSM_AGENT_ROOT="$PWD/.ssm-sandbox/home" \
SSM_DATA_DIR="$PWD/.ssm-sandbox/data" \
  npx next dev -p 3210
```

## 核心概念

| 操作 | 含义 |
|---|---|
| **收入库** | 把散落各处的 skill 收进中央库，原处换成软链（不认软链的 Agent 用拷贝） |
| **启用 / 停用** | 对某个具体 Agent 开关这个 skill |
| **暂存区** | 在库里、但没分发给任何 Agent —— 留着以后用 |
| **复制到我的库** | 把 Agent 自带的 skill 复制一份变成"我的"（只复制不删原件） |
| **重命名** | 安全改名：同时改 `SKILL.md` 的 `name:`、文件夹名和所有 Agent 链接（别在文件管理器里直接改文件夹名，会断链） |
| **标签** | 给 skill 打标签便于筛选；设置页可全局重命名 / 删除标签 |

## GitHub 备份与多机同步

设置页「GitHub 备份与同步」把你的**技能库**备份到你自己的**私有** GitHub 仓库，并在多台机器间同步（用你已登录的 `gh` CLI）。

- **⬆ 立即备份**（本地 → 云端）：只上传，绝不改动本地文件
- **⬇ 从云端同步**（云端 → 本地）：合并，保留本地改动
- **↺ 恢复到云端版本**（云端 → 本地）：覆盖 —— 恢复前自动留一个本地还原点
- 同步的是：技能文件 + `manifest.json`（哈希、来源、标签、收藏）；**不同步**「哪个 Agent 用哪个技能」——每台机器各自决定
- 跨平台内容哈希靠 `.gitattributes eol=lf` 两端保持一致（已测 macOS ↔ Windows）

## 测试

```bash
npm test          # 单元测试 + 安全护栏回归
npm run build     # 生产构建
npm run typecheck # tsc --noEmit
```

## 技术栈

Next.js 15 (App Router) · TypeScript · Tailwind CSS · better-sqlite3 · SWR · Vitest

## 许可证

[MIT](LICENSE)
