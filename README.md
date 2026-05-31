# skilllock

Reproducible lockfiles, verification, diff, security audit, and contract tests for [Agent Skills](https://agentskills.io).

APM、Vercel `skills`、skillpm 解决 **怎么装**；skilllock 解决 **装完之后怎么锁、怎么验、怎么 diff、怎么审计、怎么测、怎么复现、怎么升级**。

**v1.0.0** — 已开源：[github.com/lz1834career/skilllock](https://github.com/lz1834career/skilllock)（npm 待发布，见 [RELEASING.md](./RELEASING.md)）。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/getting-started.md](./docs/getting-started.md) | 安装与五分钟工作流 |
| [docs/commands.md](./docs/commands.md) | 完整命令参考 |
| [docs/ecosystem.md](./docs/ecosystem.md) | 与 APM / skills / skillpm 的分工 |
| [examples/demo-project](./examples/demo-project/README.md) | 可运行示例 |
| [action/README.md](./action/README.md) | GitHub Action 用法 |
| [RELEASING.md](./RELEASING.md) | npm / Action 发布 checklist |
| [CHANGELOG.md](./CHANGELOG.md) | 版本历史 |

## Install

```bash
npm install -D skilllock
npx skilllock init
npx skilllock lock
npx skilllock check
```

## Quick workflow

```bash
skilllock init
skilllock import          # optional: merge apm.yml / package.json sources
skilllock lock --snapshot # optional: offline snapshots
skilllock check           # CI gate
skilllock reproduce       # fresh clone / new machine
```

## GitHub Action

```yaml
- uses: lz1834career/skilllock/action@v1
  with:
    command: check
```

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

## License

MIT — see [LICENSE](./LICENSE).
