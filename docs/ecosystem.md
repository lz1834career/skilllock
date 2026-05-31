# 生态对比

Agent Skills 生态里，安装与运维通常是两个层次。skilllock 专注后者。

## 分工一览

| 能力 | APM | Vercel `skills` | skillpm | **skilllock** |
|------|-----|-----------------|---------|---------------|
| 安装 skills | ✅ | ✅ | ✅ | ❌（委托安装器） |
| 声明依赖清单 | 部分 | 部分 | 部分 | ✅ lockfile |
| 内容哈希锁定 | ❌ | ❌ | ❌ | ✅ sha256 逐文件 |
| MCP/Rules 统一 lock | ❌ | ❌ | ❌ | ✅ context 段 |
| verify / drift | ❌ | ❌ | ❌ | ✅ |
| diff 升级对比 | ❌ | ❌ | ❌ | ✅ |
| 安全 audit | ❌ | ❌ | ❌ | ✅ |
| 契约 / LLM test | ❌ | ❌ | ❌ | ✅ |
| SBOM | ❌ | ❌ | ❌ | ✅ |
| 离线 reproduce | ❌ | 部分 | ❌ | ✅ snapshot+cache |
| CI Action | ❌ | ❌ | ❌ | ✅ |
| 升级感知 | ❌ | ❌ | ❌ | ✅ outdated/upgrade |
| 自动 PR/Issue | ❌ | ❌ | ❌ | ✅ 工作流模板 |

## 推荐组合

```text
安装：  apm.yml / npx skills add / npx skillpm install
锁定：  skilllock lock
CI：    skilllock check
复现：  skilllock reproduce
升级：  skilllock outdated → upgrade --apply
```

## skilllock 不做什么

- **不是** package registry（不托管 skill 包）
- **不是** 安装器的替代品
- **不** 自动审查 changelog 或合并 PR（只提供工作流模板）
- **不** 扫描 filesystem 嵌套的 `skills/*/skills/*`（见下方与 sklock 对比）

## 与 sklock 的差异与选型

[sklock](https://github.com/artieax/sklock) 是与 skilllock 最接近的 lockfile 工具。两者重叠约 40%，定位不同：

| 维度 | skilllock | sklock |
|------|-----------|--------|
| Skill 布局 | 平铺 `.cursor/skills/<name>/` | 支持目录嵌套 sub-skills |
| 依赖模型 | `metadata.skilllock.dependencies` | `requires[]` + closureHash |
| 核心强项 | reproduce、audit、context lock、CI Action、upgrade | graph、lint、infer requires、嵌套 closure |
| 可视化 | `tree`（文本）、`graph`（Mermaid） | `tree`、`graph --mermaid` |

**选 skilllock 如果**：你需要 supply-chain 治理（verify/check/reproduce/audit/SBOM）、MCP 与 Rules 进同一把锁、GitHub Action 门禁、source 升级自动化。

**选 sklock 如果**：你的 skill 仓库是嵌套目录树，需要 closureHash 或 infer/lint 等编写期工具。

**推荐组合**（不互斥）：

```text
skillpm / skills / apm  →  安装
skilllock lock/check    →  CI 与复现
sklock                  →  仅当团队已标准化嵌套 skill 目录时二选一，勿重复 lock
```

## 路线图（简要）

| 版本 | 重点 |
|------|------|
| v1.0.x | lock/verify/check、Action、跨平台 hash |
| v1.1 | `graph` Mermaid 依赖图 |
| v1.2+ | 按需：嵌套 discover + closureHash |
| 暂缓 | `infer requires`（误推断风险，仅 dry-run 再考虑） |

## 覆盖度（主观估计）

| 范围 | 覆盖 |
|------|------|
| Agent Skills DevOps（lock/verify/reproduce/CI） | ~95% |
| 整个「Skills PM」问题空间（含安装+registry） | ~55–60% |

## 与 npm lockfile 的类比

| npm | skilllock |
|-----|-----------|
| `package.json` | skills + `.skilllock-sources.yaml` |
| `package-lock.json` | `skills.lock.yaml` |
| `npm ci` | `skilllock reproduce` |
| `npm audit` | `skilllock audit` |
| `npm outdated` | `skilllock outdated` |
| Dependabot | `skilllock-auto-upgrade.yml` |

## 进一步阅读

- [快速开始](./getting-started.md)
- [命令参考](./commands.md)
- [示例项目](../examples/demo-project/README.md)
