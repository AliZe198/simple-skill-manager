<div align="center">

<img src="https://raw.githubusercontent.com/AliZe198/simple-skill-manager/main/assets/mac-app-icon.png" width="120" alt="Simple Skill Manager">

<h1>Simple Skill Manager</h1>

<p>把散落在各个 AI 工具里的 skill，收成一份干净的清单。</p>

<p>
  <a href="https://www.npmjs.com/package/simple-skill-manager"><img src="https://img.shields.io/npm/v/simple-skill-manager?color=3fb3a0" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/simple-skill-manager?color=3fb3a0" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/simple-skill-manager?color=3fb3a0" alt="node version"></a>
</p>

<p><a href="README.md">English</a> | <b>中文</b></p>

</div>

Simple Skill Manager 扫描你电脑上装的 AI 编程工具，把找到的 skill 收进一份去重后的清单。之后点一下，就能决定哪个工具用哪个 skill。

支持 Claude Code、Codex、Gemini、OpenClaw、Hermes、Kimi Code 等 13 种工具。完全本地运行，无云端，无账号。界面默认英文，侧边栏底部可切中文。

<img src="https://raw.githubusercontent.com/AliZe198/simple-skill-manager/main/assets/screenshots/my-library.png" alt="我的库">

## Features

- **自动检测** 找出已安装的 Agent，扫描各自的 skill 目录。
- **去重** 同样的内容换了个名字，只显示为一行。
- **一键分发** 点头像就能把 skill 交给某个 Agent，或收回来。
- **安全改名** 文件夹、`name:` 字段和所有链接一起改。
- **标签** 给 skill 分组筛选，也能全局重命名。
- **市场** 浏览并安装 skills.sh 上的 skill。
- **MCP 总览** 只读展示 MCP 配置，密钥默认打码。
- **GitHub 备份** 通过你自己的私有仓库在多台机器间同步。

## Getting started

需要 Node.js 18 或更高版本。

```bash
npx simple-skill-manager
```

打开 http://localhost:3000 。加 `--port 4000` 可以换端口。服务只监听 `127.0.0.1`，别的机器连不上。按 Ctrl+C 停止。

首次启动只做只读扫描。你会先拿到一份去重清单，之后才谈移动文件。

### macOS app

不想每次敲命令？可以生成一个 Mac 应用，只需做一次：

```bash
git clone https://github.com/AliZe198/simple-skill-manager.git
cd simple-skill-manager
npm install
npm run build
bash scripts/make-mac-app.sh          # → ~/Applications/Simple Skill Manager.app
```

在访达里双击，或拖到 Dock 上。按 Cmd+Q 退出，服务也会一起停掉，和普通 Mac 应用一样。仓库路径是写死进应用里的，移动文件夹之后要重新跑一遍最后那行命令。

### Windows

`npx simple-skill-manager` 在 PowerShell 和 cmd 里用法完全一样。

Windows 建软链需要开发者模式（设置 → 隐私和安全性 → 开发者选项）或管理员终端。两个都不想开的话，到设置页把 Agent 切成拷贝模式。

## Screenshots

发现页列出在各个 Agent 里找到、但还没收进你的库的 skill。

<img src="https://raw.githubusercontent.com/AliZe198/simple-skill-manager/main/assets/screenshots/discover.png" alt="发现页">

## How it works

**收入库** 把散落各处的 skill 收进中央库，原来的位置换成软链，不认软链的 Agent 用拷贝。

**启用 / 停用** 对某一个 Agent 开关这个 skill，也就是每行右边那排头像。

**闲置** 指 skill 在你的库里，但暂时没交给任何 Agent。

**重命名** 同时改 `name:` 字段、文件夹名和所有 Agent 链接。自己去文件管理器里改文件夹名会断链。

**检查更新** 只处理明确记录了 git 来源的 skill，本地手写的绝不改动。

## Security

首次启动不改动任何文件。之后，应用只会写这两个目录之内：

| 环境变量 | 装的是什么 | 默认 |
|---|---|---|
| `SSM_AGENT_ROOT` | 你的 Agent 目录所在的位置 | 你的家目录 |
| `SSM_DATA_DIR` | 中央库、数据库和配置 | `~/.simple-skill-manager` |

写到这两个目录之外会被拒绝，想靠软链逃出去也会被挡。不归本应用管理的同名 skill 绝不覆盖，你手写的文件不会被动。

## Backup & sync

设置页有一个 GitHub 备份面板。它用你已经登录的 `gh` 命令行，把你的库推到你自己的私有仓库。

程序会自动检查状态，每次只显示一个合适的下一步，不需要先理解 Git 操作。两边都有改动时，可以选择合并、让云端与这台电脑一致，或让这台电脑恢复成云端版本。覆盖前都会保留还原点；如果确认期间云端又有新变化，操作会自动停止，避免误覆盖。

在机器之间同步的是 skill 文件本身，以及它们的哈希、来源和标签。「哪个 Agent 用哪个 skill」不同步，每台机器保持自己的配置。

## Contributing

想改这个应用本身？见 [CONTRIBUTING.md](CONTRIBUTING.md)（英文）。

## Credits

界面视觉设计基于 [@guokaigdg](https://github.com/guokaigdg) 的 [animal-island-ui](https://github.com/guokaigdg/animal-island-ui)，在此致谢！

## License

[MIT](LICENSE)
