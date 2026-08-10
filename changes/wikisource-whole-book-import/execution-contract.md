# 中文维基文库整本导入执行契约

## Approval

- DP-3 status: `approved`
- DP-3 approval: `2026-08-07 — user approved execution contract in chat`
- Implementation permission: `granted`
- Planning source: approved `proposal.md`, `specs/`, `design.md`, and `tasks.md`
- State automation: unavailable because the local spec-superflow scripts and templates are not installed; explicit user approval will be recorded in this file before implementation.

## Intent Lock

在保持现有 Gutenberg 在线导入兼容的前提下，接入中文维基文库官方 MediaWiki API，使用户可以从统一入口搜索中文作品，将作品的直接章节子页按自然顺序整本导入为简体中文，并在数据库中保留稳定来源、规范 URL 与许可归属。

## Approved Behavior

1. 搜索请求同时查询 `wikisource` 和 `gutenberg`，成功结果使用统一模型返回。
2. 单个 provider 失败时返回其余结果及 `sourceErrors`；全部失败时返回 `BOOK_SOURCE_UNAVAILABLE`。
3. 维基文库章节搜索命中必须归并到根作品，同一根 pageid 在当前结果页只出现一次。
4. 维基文库 `sourceBookId` 使用根页面 pageid，`sourceUrl` 使用规范 HTTPS 页面 URL。
5. 整本导入只接受可识别的主命名空间直接章节子页，排除辅助页、其他命名空间和更深层子页。
6. 章节支持阿拉伯数字、中文数字、章/回/节/卷/篇/部及上中下的可解释自然排序。
7. 正文通过 `variant=zh-hans` 的 TextExtracts API 批量获取并保存为简体段落，独立导航行和空内容被过滤。
8. 所有远程读取、解析和限制校验成功后，才调用 Supabase RPC 原子写入书籍与全部章节。
9. 相同 `(source, sourceBookId)` 重复导入返回既有书籍，`alreadyImported=true`。
10. 维基文库书籍保存 `source_attribution`，移动端显示正确书源，不得显示为 Gutenberg。
11. 超过 200 个有效章节时返回 `ONLINE_BOOK_TOO_MANY_CHAPTERS`，超过 20 MB 最终 UTF-8 正文时返回 `BOOK_DOWNLOAD_TOO_LARGE`，且不持久化部分数据。
12. 外部正文请求只允许 `https://zh.wikisource.org/w/api.php`；不得请求正文中的第三方链接。
13. 《红楼梦》必须作为真实搜索、章节发现、简体正文和整本导入验收样例。

## Scope Fence

### Included

- 服务端多 provider 契约、聚合搜索、导入分派和错误归一化。
- 中文维基文库搜索、根页归并、章节发现、自然排序和简体正文清洗。
- Supabase `source_attribution` 迁移与原子 RPC 扩展。
- 移动端来源标签、部分失败提示和携带来源的导入请求。
- 自动化测试、配置说明、决策记录和真实《红楼梦》验证文档。

### Excluded

- 现代版权书、商业 API、付费内容和任何访问限制绕过。
- 单章/部分章节选择、繁简切换、后台导入队列和进度协议。
- 通用 MediaWiki 站点支持、复杂模板/脚注交互和维基内容回写。
- 非直接子页作品的跨页面关系猜测。
- 非必要封面抓取或生成。

## Architecture Constraints

- `OnlineBookProvider` 必须是 HTTP 路由和具体书源之间的唯一书源能力边界。
- 聚合搜索必须使用 provider 结果，不得在移动端直接调用 MediaWiki。
- Wikisource API URL 必须在请求前验证 HTTPS 与精确 hostname。
- 搜索与真实正文请求必须设置明确超时和 `SceneReader/0.1` User-Agent。
- TextExtracts 每批最多 20 章，最多 3 路并发；任何批次失败均终止整本导入。
- 最终章节数组必须在 RPC 前完整构建并通过限制校验。
- 数据库原子性继续由 `import_online_book` PL/pgSQL 函数提供，不允许 Node.js 分批写入替代。
- Gutenberg 现有类型、搜索、下载、去重和导入行为必须保持兼容。
- 自动化测试使用 fixture/mock fetch；真实外部 API 只用于独立验收，不作为稳定 CI 前置条件。

## Execution Batches

### Batch 1: 多书源契约与聚合骨架

- Files: `server/src/types.ts`, `server/src/onlineBookProvider.ts`, `server/src/gutendex.ts`, `server/src/onlineBookService.ts`, aggregation tests.
- Completion: 双源成功、单源失败、全失败和 Gutenberg 回归测试通过。
- Depends on: none.

### Batch 2: 维基文库搜索与根作品归并

- Files: `server/src/wikisource.ts`, `server/test/wikisource.test.ts`, `server/.env.example`.
- Completion: 受信 URL、搜索 continuation、根标题归并、pageid 去重测试通过。
- Depends on: Batch 1.

### Batch 3: 章节发现、分类与排序

- Files: `server/src/wikisource.ts`, `server/test/wikisource.test.ts`.
- Completion: 章节模式、中文数字、辅助页排除、嵌套页排除、200/201 边界测试通过。
- Depends on: Batch 2.

### Batch 4: 简体正文与整本内存组装

- Files: `server/src/wikisource.ts`, `server/src/onlineBookService.ts`, Wikisource tests.
- Completion: `zh-hans`、导航清洗、缺页、无正文、20 MB 边界和“失败不持久化”测试通过。
- Depends on: Batch 3.

### Batch 5: 路由、原子持久化与来源归属

- Files: server route/service/repository/Supabase types, `supabase/schema.sql`, server tests.
- Completion: Wikisource 路由、未知来源拒绝、RPC attribution、重复导入和原子性测试通过；server typecheck/test/build 通过。
- Depends on: Batches 1 and 4.

### Batch 6: 移动端多书源体验

- Files: `mobile/src/types/app.ts`, `mobile/src/api/client.ts`, `mobile/src/screens/ImportScreen.tsx`, `mobile/App.tsx`.
- Completion: 来源标签、部分失败提示、导入请求来源字段测试通过；mobile typecheck 与现有测试通过。
- Depends on: Batches 1 and 5.

### Batch 7: 文档与真实验收

- Files: server README, decisions, Supabase setup, Wikisource validation report.
- Completion: 全量回归通过；《红楼梦》真实搜索与章节发现成功；schema 已更新时完成整本原子导入。
- Depends on: Batches 5 and 6.

## Test Obligations

| Approved requirement | Automated evidence | Batch |
|---|---|---|
| 聚合多个书源 | aggregation 双成功/部分失败/全失败测试 | 1 |
| 根作品归并 | Wikisource 搜索 fixture 与 pageid 去重测试 | 2 |
| 移动端书源状态 | 来源标签、sourceErrors 和请求体测试 | 6 |
| 完整章节集合 | 分类、直接子页、自然排序测试 | 3 |
| 简体正文 | `zh-hans` extracts 与导航清洗测试 | 4 |
| 原子整本持久化 | RPC schema 检查、失败前零写入测试 | 4, 5 |
| 《红楼梦》验收 | 独立真实 API 验收记录 | 7 |
| 来源与许可归属 | BookRow/RPC/mobile 映射测试 | 5, 6 |
| 导入规模限制 | 200/201 章和 20 MB 边界测试 | 3, 4 |
| 外部请求目标限制 | 非 HTTPS、错误 hostname、第三方链接测试 | 2 |

Coverage result: all 10 specification requirements are mapped; no unmapped SHALL/MUST remains.

## Required Commands

### Server

```powershell
cd "F:\codexDemo\Scene Read\server"
npm run typecheck
npm test
npm run build
```

### Mobile

```powershell
cd "F:\codexDemo\Scene Read\mobile"
npx tsc --noEmit
npm run test:scene-placement
npm run test:reader-pagination
npm run test:txt-import -- ..\docs\product-scope.md
```

### Worker

```powershell
cd "F:\codexDemo\Scene Read\worker"
$env:PYTHONPATH="F:\codexDemo\Scene Read\worker\src"
& "C:\Users\18270\AppData\Local\Programs\Python\Python313\python.exe" -m unittest discover -s tests -v
```

### Repository

```powershell
cd "F:\codexDemo\Scene Read"
git diff --check
git status --short
```

## Review Gates

- After Batch 1: review provider boundary and Gutenberg compatibility before adding Wikisource behavior.
- After Batch 4: review chapter/content parsing, limits and no-write-on-failure behavior before schema integration.
- After Batch 6: review complete server/mobile spec compliance before real external write validation.
- After Batch 7: review all changes against proposal, specs, design and this contract before completion.

## Escalation And Rewind Rules

Stop implementation and return to planning if any of the following occurs:

- MediaWiki API cannot provide stable root pageid, direct subpage enumeration or `zh-hans` extracts.
- Supporting《红楼梦》requires recursive page relationships outside direct subpages.
- Synchronous import cannot finish within the existing HTTP/runtime limits without a background queue.
- License verification requires a different copyright model than `authorized + source_attribution`.
- Supabase RPC cannot accept the complete book within configured request/database limits.
- A required behavior has no deterministic fixture or testable boundary.
- Work would require a commercial API, credential, scraping outside the official API, or a new external service.

Ordinary implementation defects, type errors and failing tests do not expand scope; diagnose and fix them inside the approved batch.

## Completion Definition

- Every execution batch is complete in dependency order.
- All mapped automated evidence passes.
- Full server, mobile and Worker regression commands pass.
- Latest Supabase schema is documented and contains backward-compatible Gutenberg behavior.
- Real《红楼梦》search and chapter discovery evidence is recorded; full import is recorded when the configured Supabase schema permits it.
- No secrets, downloaded book bodies, temporary logs or unrelated changes are included.
- No remote push is performed without separate user instruction.
