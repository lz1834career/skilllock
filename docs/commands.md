# Command reference

## Project setup

| Command | Description |
|---------|-------------|
| `init` | Scaffold policy, tests, sources, gitignore, workflow templates |
| `import` | Import source mappings from `apm.yml` / `package.json` |
| `scan` | List discovered skills |

Common options: `--agents cursor,claude`, `--global`

## Lock and verification

| Command | Description |
|---------|-------------|
| `lock` | Generate `skills.lock.yaml` |
| `verify` | Verify on-disk content matches the lock |
| `check` | verify + validate + audit + test + policy + drift + untracked |
| `validate` | SKILL.md format and lock structure |
| `drift` | Diff lock vs re-lock (no write) |
| `diff` | Compare two locks or lock vs disk |
| `explain` | Issue details and fix hints (`--json` for CI) |

`lock` options: `--snapshot`, `--global`, `--no-context`, `--agents`

`check` options: `--skip-audit`, `--skip-tests`, `--skip-validate`, `--skip-untracked`, `--skip-drift`, `--llm`

## Security and compliance

| Command | Description |
|---------|-------------|
| `audit` | Security scan (injection, obfuscation, etc.) |
| `sbom` | JSON SBOM (`--format cyclonedx`) |
| `test` | Contract tests from `skills.test.yaml` (`--llm`) |

## Reproduce and cache

| Command | Description |
|---------|-------------|
| `reproduce` | Install from sources + restore snapshots |
| `snapshot` | Write `.skilllock/snapshots/` |
| `cache list` | List reproduce cache |
| `cache clear` | Clear cache |
| `cache stats` | Cache statistics |

`reproduce` options: `--dry-run`, `--only rules|skills|context|mcp`, `--no-cache`, `--synthesize-apm`

## Observability

| Command | Description |
|---------|-------------|
| `tree` | Dependency tree |
| `graph` | Mermaid dependency graph (`--ascii` for text tree) |
| `why <skill>` | Source and dependency info for a skill |
| `untracked` | Skills on disk but not in the lock |

## Upgrades

| Command | Description |
|---------|-------------|
| `outdated` | Compare remote npm/git versions |
| `upgrade` | Upgrade suggestions |
| `upgrade --apply` | Bump source refs automatically |
| `upgrade --apply --reproduce --check` | bump + install + gate |

## Exit codes

| Command | Non-zero when |
|---------|----------------|
| `verify` / `check` / `drift` | Issues or drift detected |
| `audit` | Per `--fail-on` / policy |
| `test` | Tests fail |
| `untracked` / `outdated` | Issues found |
| `upgrade --apply` | verify/check fails |

## Environment variables (LLM test)

- `SKILLLOCK_LLM_API_KEY` / `OPENAI_API_KEY`
- `SKILLLOCK_LLM_BASE_URL`
- `SKILLLOCK_LLM_MODEL`
