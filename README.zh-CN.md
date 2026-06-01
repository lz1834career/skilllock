# skilllock

[English](./README.md) | 简体中文

面向 [Agent Skills](https://agentskills.io) 的可复现 lockfile、校验、diff、安全审计与契约测试。

APM、Vercel `skills`、skillpm 解决 **怎么装**；skilllock 解决 **装完之后怎么锁、怎么验、怎么 diff、怎么审计、怎么测、怎么复现、怎么升级**。

**v1.1.0** — [npm](https://www.npmjs.com/package/skilllock) · [GitHub](https://github.com/lz1834career/skilllock)

> 详细命令与生态对比见英文文档：[getting-started](./docs/getting-started.md)、[commands](./docs/commands.md)、[ecosystem](./docs/ecosystem.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/getting-started.md](./docs/getting-started.md) | 安装与五分钟工作流（英文） |
| [docs/commands.md](./docs/commands.md) | 完整命令参考（英文） |
| [docs/ecosystem.md](./docs/ecosystem.md) | 与 APM / skills / skillpm / sklock 的分工（英文） |
| [examples/demo-project](./examples/demo-project/README.md) | 可运行示例 |
| [action/README.md](./action/README.md) | GitHub Action |
| [RELEASING.md](./RELEASING.md) | 版本发布 checklist |
| [CHANGELOG.md](./CHANGELOG.md) | 版本历史 |

## 安装

```bash
npm install -D skilllock
npx skilllock init
npx skilllock lock
npx skilllock check
```

或一次性运行（无需写入 `package.json`）：

```bash
npx skilllock@1.1.0 init
```

## 快速工作流

```bash
skilllock init
skilllock import          # 可选：合并 apm.yml / package.json sources
skilllock lock --snapshot # 可选：离线快照
skilllock check           # CI 门禁
skilllock reproduce       # 新 clone / 新机器
skilllock graph           # Mermaid 依赖图
```

## GitHub Action

`skilllock init` 会生成 weekly drift 与 auto-upgrade 工作流；PR 上的 `check` 需自行添加（见 [getting-started](./docs/getting-started.md#github-action)）。

```yaml
- uses: lz1834career/skilllock/action@v1.1.0
  with:
    command: check
```

## 与 sklock 怎么选？

| 你更需要 | 选 |
|---------|-----|
| CI 门禁、reproduce、audit、MCP/Rules lock、升级 | **skilllock** |
| 嵌套 `skills/*/skills/*` 目录 + closureHash | [sklock](https://github.com/artieax/sklock) |
| 两者可组合 | 安装器装 skill → `skilllock lock` / `check`，见 [ecosystem](./docs/ecosystem.md) |

skilllock 采用 **平铺目录**（`.cursor/skills/<name>/`）+ frontmatter **`metadata.skilllock.dependencies`** 声明依赖，不做 filesystem 嵌套发现。

## Lockfile v2（摘要）

```yaml
lockfileVersion: 2
skills:
  - name: demo-skill
    source: { type: apm, ref: org/repo/skills/demo-skill }
    dependencies: [helper-skill]
    files: [{ path: SKILL.md, hash: sha256:..., size: 123 }]
context:
  - kind: mcp
    name: mcp.json
    files: [...]
```

## 从源码开发

```bash
git clone https://github.com/lz1834career/skilllock.git
cd skilllock
npm ci
npm run build
node dist/cli.js check --project examples/demo-project
```

## License

MIT — 见 [LICENSE](./LICENSE)。
