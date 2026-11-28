# vendor/canvas 来源与校验

本目录是内置的第三方画布渲染引擎（EditorCanvas 及其 gallery / skills 资源），
以产物形式随插件一起打包（`package.json` 的 `files` 已声明 `vendor/canvas/*.js` 等）。
它不是本仓库手写的业务代码，升级时容易“版本漂移”。

## 来源

- 组件：EditorCanvas（画布渲染引擎，含 `gallery/` 素材与 `skills/` 说明）
- 打包方式：直接以编译/发布产物入库，仓库内不做二次构建
- 升级步骤：
  1. 用上游指定版本重新生成/替换整个 `vendor/canvas/` 目录；
  2. 重新生成 `SHA256SUMS`（见下）；
  3. `npm run check` 与 `tests/host-bff.mjs` 通过后提交。

## 校验

`SHA256SUMS` 记录了本目录全部文件（除去 `SHA256SUMS` 与 `PROVENANCE.md` 自身）的
SHA-256，用于升级前后比对，避免悄悄混入未声明的改动：

```bash
cd plugin/vendor/canvas
shasum -a 256 -c SHA256SUMS
```

重新生成：

```bash
cd plugin/vendor/canvas
find . -type f ! -name SHA256SUMS ! -name PROVENANCE.md -print0 \
  | sort -z | xargs -0 shasum -a 256 > SHA256SUMS
```
