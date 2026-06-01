# skilllock

English | [简体中文](./README.zh-CN.md)

Reproducible lockfiles, verification, diff, security audit, and contract tests for [Agent Skills](https://agentskills.io).

APM, Vercel `skills`, and skillpm solve **how to install** skills; skilllock solves **how to lock, verify, diff, audit, test, reproduce, and upgrade** after install.

**v1.1.0** — [npm](https://www.npmjs.com/package/skilllock) · [GitHub](https://github.com/lz1834career/skilllock)

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/getting-started.md](./docs/getting-started.md) | Install and five-minute workflow |
| [docs/commands.md](./docs/commands.md) | Command reference |
| [docs/ecosystem.md](./docs/ecosystem.md) | APM / skills / skillpm / sklock comparison |
| [examples/demo-project](./examples/demo-project/README.md) | Runnable example |
| [action/README.md](./action/README.md) | GitHub Action |
| [RELEASING.md](./RELEASING.md) | Release checklist (maintainers) |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

## Install

```bash
npm install -D skilllock
npx skilllock init
npx skilllock lock
npx skilllock check
```

One-off (no `package.json` entry):

```bash
npx skilllock@1.1.0 init
```

## Quick workflow

```bash
skilllock init
skilllock import          # optional: merge apm.yml / package.json sources
skilllock lock --snapshot # optional: offline snapshots
skilllock check           # CI gate
skilllock reproduce       # fresh clone / new machine
skilllock graph           # Mermaid dependency graph
```

## GitHub Action

`skilllock init` scaffolds weekly drift and auto-upgrade workflows; add a PR check workflow manually (see [getting-started](./docs/getting-started.md#github-action)).

```yaml
- uses: lz1834career/skilllock/action@v1.1.0
  with:
    command: check
```

## skilllock vs sklock

| You need | Choose |
|----------|--------|
| CI gates, reproduce, audit, MCP/Rules lock, upgrades | **skilllock** |
| Nested `skills/*/skills/*` layout + closureHash | [sklock](https://github.com/artieax/sklock) |
| Both | Install with an installer → `skilllock lock` / `check` — see [ecosystem](./docs/ecosystem.md) |

skilllock uses a **flat layout** (`.cursor/skills/<name>/`) and **`metadata.skilllock.dependencies`** in frontmatter; it does not discover nested filesystem trees.

## Lockfile v2 (summary)

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

## Develop from source

```bash
git clone https://github.com/lz1834career/skilllock.git
cd skilllock
npm ci
npm run build
node dist/cli.js check --project examples/demo-project
```

## License

MIT — see [LICENSE](./LICENSE).
