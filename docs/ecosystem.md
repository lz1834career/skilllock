# Ecosystem comparison

In the Agent Skills ecosystem, **install** and **operate** are usually separate layers. skilllock focuses on the latter.

## Capability matrix

| Capability | APM | Vercel `skills` | skillpm | **skilllock** |
|------------|-----|-----------------|---------|---------------|
| Install skills | ✅ | ✅ | ✅ | ❌ (delegates to installers) |
| Declared dependency manifest | partial | partial | partial | ✅ lockfile |
| Per-file content hashes | ❌ | ❌ | ❌ | ✅ sha256 |
| MCP/Rules in one lock | ❌ | ❌ | ❌ | ✅ `context` section |
| verify / drift | ❌ | ❌ | ❌ | ✅ |
| diff for upgrades | ❌ | ❌ | ❌ | ✅ |
| security audit | ❌ | ❌ | ❌ | ✅ |
| contract / LLM tests | ❌ | ❌ | ❌ | ✅ |
| SBOM | ❌ | ❌ | ❌ | ✅ |
| offline reproduce | ❌ | partial | ❌ | ✅ snapshot + cache |
| CI Action | ❌ | ❌ | ❌ | ✅ |
| upgrade awareness | ❌ | ❌ | ❌ | ✅ outdated/upgrade |
| auto PR/Issue templates | ❌ | ❌ | ❌ | ✅ workflow templates |

## Recommended stack

```text
Install:   apm.yml / npx skills add / npx skillpm install
Lock:      skilllock lock
CI:        skilllock check
Reproduce: skilllock reproduce
Upgrade:   skilllock outdated → upgrade --apply
```

## What skilllock does not do

- **Not** a package registry
- **Not** a replacement for installers
- **Does not** review changelogs or merge PRs automatically (workflow templates only)
- **Does not** scan nested `skills/*/skills/*` filesystem trees (see sklock below)

## skilllock vs sklock

[sklock](https://github.com/artieax/sklock) is the closest lockfile tool. Roughly 40% overlap, different focus:

| Dimension | skilllock | sklock |
|-----------|-----------|--------|
| Skill layout | Flat `.cursor/skills/<name>/` | Nested sub-skills directories |
| Dependencies | `metadata.skilllock.dependencies` | `requires[]` + closureHash |
| Strengths | reproduce, audit, context lock, CI Action, upgrade | graph, lint, infer requires, nested closure |
| Visualization | `tree`, `graph` (Mermaid) | `tree`, `graph --mermaid` |

**Choose skilllock** if you need supply-chain governance (verify/check/reproduce/audit/SBOM), MCP and Rules in one lock, GitHub Action gates, and source upgrade automation.

**Choose sklock** if your repo uses nested skill directories and you need closureHash or infer/lint authoring tools.

**Combined** (not mutually exclusive):

```text
skillpm / skills / apm  →  install
skilllock lock/check    →  CI and reproduce
sklock                  →  only if nested layout is standard; avoid double-locking
```

## Roadmap (brief)

| Version | Focus |
|---------|--------|
| v1.0.x | lock/verify/check, Action, cross-platform hashes |
| v1.1 | `graph` Mermaid dependency graph |
| v1.2+ | On demand: nested discover + closureHash |
| Deferred | `infer requires` (mis-inference risk; dry-run only if added) |

## Coverage (subjective)

| Scope | Coverage |
|-------|----------|
| Agent Skills DevOps (lock/verify/reproduce/CI) | ~95% |
| Full “Skills PM” (install + registry) | ~55–60% |

## Analogy to npm lockfiles

| npm | skilllock |
|-----|-----------|
| `package.json` | skills + `.skilllock-sources.yaml` |
| `package-lock.json` | `skills.lock.yaml` |
| `npm ci` | `skilllock reproduce` |
| `npm audit` | `skilllock audit` |
| `npm outdated` | `skilllock outdated` |
| Dependabot | `skilllock-auto-upgrade.yml` |

## Further reading

- [Getting started](./getting-started.md)
- [Command reference](./commands.md)
- [Example project](../examples/demo-project/README.md)
