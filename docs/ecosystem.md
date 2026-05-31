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
