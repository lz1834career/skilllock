# 快速开始

## 安装

```bash
npm install -D skilllock
npx skilllock --help
```

未发布前可在 monorepo 根目录：

```bash
npm install -g .
skilllock --version
```

## 五分钟工作流

```bash
# 1. 初始化配置模板
skilllock init

# 2. 导入 source 映射（可选）
skilllock import

# 3. 扫描已安装 skills
skilllock scan

# 4. 生成 lockfile
skilllock lock

# 5. CI 门禁
skilllock check
```

## 新机器 / 新同事复现

```bash
git clone <repo>
cd project
skilllock reproduce
skilllock verify
```

离线环境：在有网机器 `skilllock lock --snapshot`，提交 `.skilllock/snapshots/` 后 `skilllock reproduce`。

## GitHub Action

```yaml
- uses: lz1834career/skilllock/action@v1
  with:
    command: check
```

Monorepo 见 `examples/demo-project/.github/workflows/skilllock-ci.yml`。

## 策略文件

`skilllock init` 生成 `skilllock.policy.yaml`：

```yaml
drift:
  failOn: true
untracked:
  failOn: true
audit:
  failOn: warning
  denyRules: [hidden-instruction, unicode-obfuscation]
```

## 下一步

- 完整命令列表：[commands.md](./commands.md)
- 与 APM / skills CLI 的分工：[ecosystem.md](./ecosystem.md)
