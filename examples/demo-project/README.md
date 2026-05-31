# skilllock demo project

最小可运行示例：展示 init → lock → check → reproduce 工作流。

## 结构

```
examples/demo-project/
├── .cursor/skills/          # 已安装的 skills
├── skills.lock.yaml         # lockfile v2
├── skilllock.policy.yaml
├── skills.test.yaml
├── .skilllock-sources.yaml
└── .github/workflows/       # CI 示例
```

## 本地试用

在仓库根目录：

```bash
npm run build
node dist/cli.js init --project examples/demo-project --force
node dist/cli.js lock --project examples/demo-project
node dist/cli.js check --project examples/demo-project --skip-tests
```

或在 demo 目录（安装 skilllock 后）：

```bash
cd examples/demo-project
npx skilllock check
npx skilllock tree
npx skilllock why demo-skill
```

## CI

`.github/workflows/skilllock-ci.yml` 演示 PR 上使用 `./action`（monorepo）或发布后 `YOUR_ORG/skilllock/action@v1`。
