# Obsidian Language Learner 项目梳理

## 项目定位

这个项目是一个 Obsidian 语言学习插件，插件名是 `Language Learner`。核心目标是把阅读、划词查词、生词记录、复习导出、统计放进 Obsidian 里，做成一套完整的语言学习流。

插件入口是 `src/plugin.ts`，插件加载后会初始化设置、数据库、文本解析器、可选本地 HTTP server，并注册多个 Obsidian 自定义视图。

插件元信息在 `manifest.json`，当前插件版本是 `0.2.7`。

## 主要功能链路

1. 阅读文件需要 frontmatter 里有 `langr` 标记，插件会给 Markdown 页面加“打开阅读模式”的入口。
2. 阅读模式由 `src/views/ReadingView.ts` 和 `src/views/ReadingArea.vue` 承载，正文按 `^^^article`、`^^^words`、`^^^notes` 分段。
3. 文本解析在 `src/views/parser.ts`，使用 `retext-english` 把英文拆成词和句子，再根据词库状态包成不同 class 的 `span`。
4. 用户点击或选择单词后，触发 `obsidian-langr-search` 自定义事件。
5. 查词面板展示多个词典，新词面板自动填充表单。
6. 提交生词后写入数据库，并刷新阅读页高亮、统计页、文本词库和复习卡片文件。

## 视图模块

### 查词面板

相关文件：

- `src/views/SearchPanelView.ts`
- `src/views/SearchPanel.vue`

功能：

- 提供单词输入框。
- 支持查询历史前进、后退。
- 根据设置动态加载词典。
- 支持有道、剑桥、句酷、沪江、DeepL 等词典。

### 生词记录面板

相关文件：

- `src/views/LearnPanelView.ts`
- `src/views/LearnPanel.vue`

功能：

- 维护 expression、meaning、类型、状态、tag、笔记、例句。
- 查询单词时自动填充表单。
- 支持从阅读上下文里带入例句、出处和机器翻译。
- 提交后写入数据库，并通过事件通知阅读视图和统计视图刷新。

### 阅读视图

相关文件：

- `src/views/ReadingView.ts`
- `src/views/ReadingArea.vue`

功能：

- 按段落分页阅读。
- 支持音频来源 `langr-audio`。
- 支持阅读笔记 `^^^notes`。
- 高亮新词、忽略词、学习中词、熟悉词、已知词、已学词。
- 结束阅读时可把当前页未记录单词批量标记为 ignore。
- 保存阅读位置到 frontmatter 的 `langr-pos`。

### 数据面板

相关文件：

- `src/views/DataPanelView.ts`
- `src/views/DataPanel.vue`

功能：

- 使用 Naive UI 表格展示词库。
- 支持按表达式搜索。
- 支持按状态过滤。
- 支持按 tag 过滤。
- 支持展开查看单词更多笔记和例句信息。

### 统计页

相关文件：

- `src/views/StatView.ts`
- `src/views/Stat.vue`

功能：

- 使用 ECharts 展示近 7 天数据。
- 展示每日 ignore 数、每日非 ignore 数和累计词数。
- 生词提交或 ignore 更新后会刷新图表。

## 数据层

数据访问抽象在 `src/db/base.ts`。

`DbProvider` 定义了以下核心能力：

- 打开、关闭数据库。
- 查询文章中已记录单词和词组。
- 查询单个表达式详情。
- 批量查询表达式简略信息。
- 查询某个时间之后添加的表达式。
- 查询全部表达式简略信息。
- 写入或更新表达式。
- 查询 tag。
- 批量写入 ignore 单词。
- 查询例句是否已存在。
- 获取词数统计。
- 导入、导出、销毁数据库。

### 本地 IndexedDB 实现

相关文件：

- `src/db/local_db.ts`
- `src/db/idb.ts`

实现方式：

- 使用 Dexie 封装 IndexedDB。
- 主要表是 `expressions` 和 `sentences`。
- `expressions` 存储单词或词组本体、含义、状态、类型、tag、笔记、例句引用和更新时间。
- `sentences` 存储例句文本、翻译和出处。

### 远端服务实现

相关文件：

- `src/db/web_db.ts`

实现方式：

- 使用 Obsidian 的 `requestUrl` 调接口。
- 通过 `/lr/word`、`/lr/update`、`/lr/tags` 等接口读写远端词库。
- 支持 http、https 和 API key。

## 内置 HTTP Server

相关文件：

- `src/api/server.ts`

功能：

- 可选启动一个插件内置简易 HTTP server。
- 暴露 `/word`、`/update`、`/tags`、`/echo`。
- 主要用于外部工具或浏览器插件联动 Obsidian 内的词库能力。

## 构建方式

构建配置：

- `package.json`
- `esbuild.config.mjs`

常用命令：

```bash
npm install
npm run dev
npm run build
```

`npm run build` 会先跑 TypeScript 检查，再用 esbuild 把 `src/plugin.ts` 打包成 `main.js`，并把 CSS 打包成 `styles.css`。

`npm run dev` 会启动 esbuild watch，适合开发时使用。

## 当前构建状态

已尝试执行：

```bash
npm run build
```

当前失败原因是依赖尚未安装，错误为：

```text
sh: tsc: command not found
```

这说明当前不是代码编译错误，而是工作区缺少 `node_modules`。需要先执行 `npm install` 或 `npm ci` 后再验证完整构建。

## 接手时重点关注

- `package.json` 仍是 sample plugin 的 name、description、version，和 `manifest.json` 不一致。
- Vue 组件里有不少全局事件、全局 `store`、`getCurrentInstance().appContext.config.globalProperties`，后续改功能时要小心事件链路。
- 阅读解析使用 `v-html` 渲染 parser 生成 HTML，当前内容来自本地文章解析；若后续引入外部 HTML，需要注意安全边界。
- 代码里有一些历史功能残留，比如 PDF 视图被注释掉，后续可以评估是否清理。
- 如果后续修改代码，新增函数、变量、常量、computed、ref、watch、类型、interface、enum 前都需要添加 `/** */` 格式的中文注释。

