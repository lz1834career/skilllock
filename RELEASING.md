# Releasing skilllock

维护者发布 checklist。

**当前状态**：`skilllock@1.1.0` 已发布至 [npm](https://www.npmjs.com/package/skilllock)；Git tag `v1.1.0` 与 GitHub Action 可用。

## 发布顺序（推荐）

1. 本地验证（§2）
2. 更新版本号 + CHANGELOG（§5）
3. commit → push → `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub Release（指向该 tag）
5. `npm publish`（§3）
6. 更新 README / getting-started 中的版本引用

## 1. 仓库元数据

`package.json` 应包含：

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
npm login
npm whoami

# 干跑：查看 tarball 内容
npm pack --dry-run

# 正式发布（prepublishOnly 会自动 typecheck + test + build）
npm publish
```

发布后验证：

```bash
npm view skilllock version
npx skilllock@latest --version
```

用户安装：

```bash
npm install -D skilllock
npx skilllock init
```

## 4. 发布 GitHub Action

Action 位于 `action/action.yml`。用户引用：

```yaml
- uses: lz1834career/skilllock/action@v1.1.0
  with:
    command: check
```

步骤：

1. 确保 git tag 已 push（与 npm 版本一致，如 `v1.1.0`）
2. 创建 [GitHub Release](https://github.com/lz1834career/skilllock/releases) 指向该 tag
3. （可选）更新浮动 tag：`git tag -f v1 v1.1.0 && git push origin v1 --force`
4. （可选）GitHub Marketplace，见 `action/README.md`

Action 当前从仓库源码 `npm ci && npm run build && npm install -g .` 安装；npm 发布后用户也可在自有 workflow 中 `npm install -g skilllock@<version>`。

## 5. 版本 bump

1. 更新 `package.json` `version`
2. 更新 `src/cli.ts` 中 `.version(...)`
3. 更新 `CHANGELOG.md`
4. commit + tag + push
5. GitHub Release + `npm publish`
6. 更新 README / `docs/getting-started.md` 中的 `@vX.Y.Z` 与 `npx skilllock@X.Y.Z` 引用

## 6. 发布后文档

- [ ] README 顶部 npm / GitHub 链接与版本号
- [ ] `docs/getting-started.md` 安装说明
- [ ] `action/README.md` Action 版本 pin
- [ ] CHANGELOG 该版本条目
