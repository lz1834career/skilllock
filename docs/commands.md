# 命令参考

## 项目初始化

| 命令 | 说明 |
|------|------|
| `init` | 生成 policy、tests、sources、gitignore、CI 工作流模板 |
| `import` | 从 `apm.yml` / `package.json` 导入 source 映射 |
| `scan` | 列出已发现的 skills |

常用选项：`--agents cursor,claude`、`--global`

## Lock 与校验

| 命令 | 说明 |
|------|------|
| `lock` | 生成 `skills.lock.yaml` |
| `verify` | 校验磁盘内容与 lock 一致 |
| `check` | verify + validate + audit + test + policy + drift + untracked |
| `validate` | SKILL.md 格式与 lock 结构 |
| `drift` | lock vs 重新 lock 的差异（不写入） |
| `diff` | 两个 lock 或 lock vs 磁盘 |
| `explain` | 问题说明 + 修复建议（`--json` 供 CI） |

`lock` 选项：`--snapshot`、`--global`、`--no-context`、`--agents`

`check` 选项：`--skip-audit`、`--skip-tests`、`--skip-validate`、`--skip-untracked`、`--skip-drift`、`--llm`

## 安全与合规

| 命令 | 说明 |
|------|------|
| `audit` | 注入/混淆等安全扫描 |
| `sbom` | JSON SBOM（`--format cyclonedx`） |
| `test` | `skills.test.yaml` 契约测试（`--llm`） |

## 复现与缓存

| 命令 | 说明 |
|------|------|
| `reproduce` | 从 source 安装 + snapshot 恢复 |
| `snapshot` | 写入 `.skilllock/snapshots/` |
| `cache list` | 查看 reproduce 缓存 |
| `cache clear` | 清理缓存 |
| `cache stats` | 缓存统计 |

`reproduce` 选项：`--dry-run`、`--only rules|skills|context|mcp`、`--no-cache`、`--synthesize-apm`

## 可观测性

| 命令 | 说明 |
|------|------|
| `tree` | 依赖树 |
| `graph` | Mermaid 依赖图（`--ascii` 同 tree） |
| `why <skill>` | skill 来源与依赖关系 |
| `untracked` | 磁盘上有但未进 lock 的 skills |

## 升级

| 命令 | 说明 |
|------|------|
| `outdated` | 对比远程 npm/git 版本 |
| `upgrade` | 升级建议 |
| `upgrade --apply` | 自动 bump source ref |
| `upgrade --apply --reproduce --check` | bump + 安装 + 门禁 |

## Exit codes

| 命令 | 非零 exit |
|------|-----------|
| `verify` / `check` / `drift` | 存在问题或 drift |
| `audit` | 按 `--fail-on` / policy |
| `test` | 测试失败 |
| `untracked` / `outdated` | 发现问题 |
| `upgrade --apply` | verify/check 失败 |

## 环境变量（LLM test）

- `SKILLLOCK_LLM_API_KEY` / `OPENAI_API_KEY`
- `SKILLLOCK_LLM_BASE_URL`
- `SKILLLOCK_LLM_MODEL`
