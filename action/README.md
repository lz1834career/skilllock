# skilllock GitHub Action

Run [skilllock](https://www.npmjs.com/package/skilllock) in CI: verify, check, audit, drift, test, outdated, upgrade.

## Usage

```yaml
name: skilllock
on: [pull_request, push]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: lz1834career/skilllock/action@v1.1.0
        with:
          command: check
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `command` | `check` | `check`, `verify`, `audit`, `drift`, `test`, `validate`, `outdated`, `upgrade`, `explain` |
| `project` | `.` | Project root |
| `lockfile` | | Lockfile path |
| `policy` | | Policy file path |
| `tests` | | Tests file path |
| `fail-on-audit` | `warning` | Audit fail level |
| `skip-audit` | `false` | Skip audit in check |
| `skip-tests` | `false` | Skip tests in check |
| `skip-validate` | `false` | Skip SKILL.md validation in check |
| `llm` | `false` | Run LLM golden tests |
| `apply-upgrades` | `false` | `upgrade --apply` |
| `reproduce` | `false` | `upgrade --apply --reproduce` |
| `run-check` | `false` | `upgrade --apply --check` |
| `node-version` | `20` | Node.js version |

## Upgrade automation

```yaml
- uses: lz1834career/skilllock/action@v1.1.0
  with:
    command: upgrade
    apply-upgrades: "true"
    reproduce: "true"
    run-check: "true"
```

## Requirements

- Node.js 20+
- Project must contain `skills.lock.yaml` (run `skilllock init` && `skilllock lock` locally first)
