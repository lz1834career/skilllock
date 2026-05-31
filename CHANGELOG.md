# Changelog

All notable changes to skilllock are documented here.

## 1.0.0 — 2026-05-30

First stable release of the Agent Skills lock / verify / reproduce layer.

### Highlights

- Lockfile v2 with skills, context (MCP/rules/AGENTS), sources, dependencies
- `verify`, `check`, `drift`, `diff`, `audit`, `validate`, `test`, `explain`
- `reproduce` with snapshot fallback, cache, rules restore, `--only`
- `outdated`, `upgrade`, `upgrade --apply --reproduce --check`
- `tree`, `why`, `untracked`, `sbom` (incl. CycloneDX)
- LLM golden tests (`test --llm`, `check --llm`)
- GitHub Action (`action/`) + workflow templates via `init`
- Policy gates: `drift.failOn`, `untracked.failOn`, audit rules

### Added

- CLI commands: init, scan, import, lock, verify, diff, audit, test, sbom, validate, check, drift, snapshot, reproduce, cache, tree, why, untracked, outdated, upgrade, explain
- Example project under `examples/demo-project`
- Documentation under `docs/`
