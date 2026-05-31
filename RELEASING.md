# Releasing skilllock

发布前 checklist（**执行 `npm publish` 前请逐项确认**）。

## 1. 更新仓库元数据

编辑 `package.json`：

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/lz1834career/skilllock.git"
},
"bugs": { "url": "https://github.com/lz1834career/skilllock/issues" },
"homepage": "https://github.com/lz1834career/skilllock#readme"
```

## 2. 本地验证

```bash
npm run typecheck
npm test
npm run build
npm run pack:check
node dist/cli.js --version
```

## 3. 发布 npm

```bash
# 登录 npm（一次性）
npm login

# 干跑：查看 tarball 内容
npm pack --dry-run

# 正式发布（请确认版本号）
npm publish --access public
```

发布后用户安装：

```bash
npm install -D skilllock
npx skilllock init
```

## 4. 发布 GitHub Action

Action 位于 `action/action.yml`。用户仓库引用方式：

```yaml
- uses: lz1834career/skilllock/action@v1
  with:
    command: check
```

发布步骤：

1. 打 git tag：`git tag v1.0.0 && git push origin v1.0.0`
2. 在 GitHub Releases 创建 release，指向该 tag
3. （可选）在 GitHub Marketplace 发布 Action，README 见 `action/README.md`

## 5. 版本 bump

1. 更新 `package.json` version
2. 更新 `src/cli.ts` 中 `.version(...)`
3. 更新 `CHANGELOG.md`
4. commit + tag
