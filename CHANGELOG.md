# Changelog

All notable changes to skilllock are documented here.

## 1.1.0 — 2026-05-30

### Added

- `graph` command: Mermaid flowchart for declared skill dependencies (`--ascii` for text tree)

### Changed

- README and ecosystem docs: sklock comparison, layout model (flat + metadata deps), roadmap

## 1.0.1 — 2026-05-30

### Fixed

- GitHub Action builds from source before `npm install -g` (fixes CI exit code 127 when `dist/` is not in git)
- Hash CRLF and LF text files identically so lockfiles verify on Linux CI after Windows lock generation
- Demo project lockfile uses portable `projectRoot: .` and LF-normalized hashes

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
