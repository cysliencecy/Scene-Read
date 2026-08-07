# 中文维基文库整本导入实施任务

## File Structure

### Create

- `server/src/onlineBookProvider.ts`：定义多书源 provider 接口、统一错误归一化和 provider 注册表。
- `server/src/wikisource.ts`：实现中文维基文库 API 客户端、搜索归并、章节发现、排序、正文批量获取与清洗。
- `server/test/onlineBookAggregation.test.ts`：验证多书源聚合、部分失败、全失败和导入分派。
- `server/test/wikisource.test.ts`：使用固定 API fixture 验证根页归并、章节排序、简体正文、限制和受信 URL。
- `docs/e2e-validation-v6-wikisource.md`：记录《红楼梦》真实搜索、章节发现和整本导入验收结果。

### Modify

- `server/src/types.ts`：扩展 `OnlineBookSource`、来源错误、归属字段和聚合搜索响应类型。
- `server/src/gutendex.ts`：将现有 Gutenberg 搜索与导入能力适配统一 provider 契约。
- `server/src/onlineBookService.ts`：并行聚合 provider 搜索、回填已导入 ID，并按来源分派导入。
- `server/src/index.ts`：允许 `wikisource` 导入请求并保持未知来源校验。
- `server/src/repository.ts`：映射 `source_attribution` 并向原子导入 RPC 传递归属信息。
- `server/src/supabaseClient.ts`：扩展 Supabase book row 到领域模型的来源归属映射。
- `server/test/onlineBooks.test.ts`：保持现有 Gutenberg 行为回归并覆盖新增兼容字段。
- `server/.env.example`：记录固定受信的中文维基文库 API 配置。
- `server/README.md`：记录多书源接口、限制、错误代码和真实测试命令。
- `supabase/schema.sql`：新增 `source_attribution` 列并扩展 `import_online_book` RPC 参数。
- `mobile/src/types/app.ts`：同步多书源、来源错误和归属字段类型。
- `mobile/src/api/client.ts`：导入请求携带 `source`，解析聚合搜索响应。
- `mobile/src/screens/ImportScreen.tsx`：显示书源标签和非阻断的部分失败提示。
- `mobile/App.tsx`：保存聚合搜索警告，并按所选书籍来源发起导入。
- `docs/decisions.md`：记录选择中文维基文库、整本导入和 `zh-hans` 的架构决定。
- `docs/supabase-setup.md`：说明执行新 schema 和来源归属字段的要求。

## Interfaces

### Shared Domain Types

```ts
export type OnlineBookSource = 'gutenberg' | 'wikisource';

export type OnlineBookSourceError = {
  source: OnlineBookSource;
  code: string;
};

export type OnlineBook = {
  source: OnlineBookSource;
  sourceBookId: string;
  title: string;
  authors: string[];
  languages: string[];
  sourceUrl: string;
  sourceAttribution?: string;
  copyrightStatus: BookCopyrightStatus;
  downloadCount: number;
  canImport: boolean;
  importedBookId?: string;
};

export type OnlineBookSearchPage = {
  items: OnlineBook[];
  page: number;
  total: number;
  hasNextPage: boolean;
  sourceErrors: OnlineBookSourceError[];
};
```

### Provider Contract

```ts
export type OnlineBookProvider = {
  source: OnlineBookSource;
  search(query: string, page: number): Promise<OnlineBookSearchPage>;
  importBook(sourceBookId: string, visualStyle: VisualStyle): Promise<OnlineBookImportResult>;
};
```

### HTTP Contract

```ts
GET /online-books/search?q=<query>&page=<page>
// -> { data: OnlineBookSearchPage }

POST /online-books/import
// body -> { source: OnlineBookSource; sourceBookId: string; visualStyle: VisualStyle }
// response -> { data: OnlineBookImportResult }
```

### Persistence Contract

```sql
books.source_attribution text null

import_online_book(
  ...existing parameters...,
  p_source_attribution text
) returns books
```

### Cross-Batch Ownership

- Batch 1 **produces** shared types and `OnlineBookProvider`; Batches 2、5、6 **consume** them.
- Batch 2 **produces** Wikisource search normalization; Batch 3 **consumes** its root-page identity and API client.
- Batch 3 **produces** ordered chapter descriptors; Batch 4 **consumes** them to build `Chapter[]`.
- Batch 4 **produces** a complete in-memory `OnlineBookImportResult` input; Batch 5 **consumes** it through the repository RPC.
- Batch 5 **produces** stable HTTP and persistence contracts; Batch 6 **consumes** the HTTP response and request types.
- Batch 7 **consumes** all completed interfaces and produces verification evidence only.

## Requirement Mapping

| Requirement | Implementation batches |
|---|---|
| 聚合多个书源 | 1, 5, 6 |
| 维基文库结果表示整部作品 | 2 |
| 移动端显示书源状态 | 6 |
| 发现完整章节集合 | 3 |
| 获取简体中文正文 | 4 |
| 原子化整本持久化 | 4, 5 |
| 《红楼梦》真实验收 | 7 |
| 保存来源与许可归属 | 1, 5, 6 |
| 限制导入规模 | 3, 4 |
| 限制外部请求目标 | 2 |

## Batch 1: 多书源契约与聚合骨架

**Depends on:** None

**Files:** `server/src/types.ts`, `server/src/onlineBookProvider.ts`, `server/src/gutendex.ts`, `server/src/onlineBookService.ts`, `server/test/onlineBookAggregation.test.ts`, `server/test/onlineBooks.test.ts`

**Interfaces:** Produces `OnlineBookSource`, `OnlineBookSourceError`, expanded `OnlineBookSearchPage`, and `OnlineBookProvider`. Preserves existing Gutenberg normalized output.

### TDD Phases

1. **Red — 3 min:** 在 `server/test/onlineBookAggregation.test.ts` 写双源成功、单源失败、全失败三个测试，断言 `sourceErrors` 和聚合顺序。
2. **Confirm Red — 2 min:** 运行 `npx tsx --test test/onlineBookAggregation.test.ts`，确认因 provider 契约与聚合实现缺失而失败。
3. **Green — 5 min:** 在 `types.ts`、`onlineBookProvider.ts` 和 `onlineBookService.ts` 实现最小契约、注册表与 `Promise.allSettled` 聚合，使新测试通过。
4. **Compatibility — 4 min:** 在 `gutendex.ts` 包装现有能力并扩展 `onlineBooks.test.ts`，确认 Gutenberg 字段、分页和错误行为不变。
5. **Refactor — 3 min:** 收紧未知 provider 和错误归一化类型，运行 `npm run typecheck` 与两份定向测试。

## Batch 2: 维基文库搜索与根作品归并

**Depends on:** Batch 1

**Files:** `server/src/wikisource.ts`, `server/test/wikisource.test.ts`, `server/.env.example`

**Interfaces:** Consumes `OnlineBookProvider`; produces Wikisource `search()` results whose `sourceBookId` is the root `pageid` and whose `sourceUrl` is canonical.

### TDD Phases

1. **Red — 4 min:** 在 `wikisource.test.ts` 添加包含根页、两个章节子页、重复命中和辅助页面的 MediaWiki 搜索 fixture，断言只返回一个根作品。
2. **Confirm Red — 2 min:** 运行定向测试，确认缺少 Wikisource provider 和根页解析而失败。
3. **Green — 5 min:** 实现受信 HTTPS API 校验、主命名空间搜索、根标题提取、根页面批量解析和按 pageid 去重。
4. **Error Cases — 4 min:** 增加非 HTTPS 配置、错误 hostname、continuation 和简体查询 fixture，补齐 `BOOK_SOURCE_URL_REJECTED` 与可导入状态测试。
5. **Refactor — 3 min:** 抽出 MediaWiki 请求构造和 continuation helper，运行 `wikisource.test.ts` 与服务端 typecheck。

## Batch 3: 章节发现、分类与自然排序

**Depends on:** Batch 2

**Files:** `server/src/wikisource.ts`, `server/test/wikisource.test.ts`

**Interfaces:** Consumes root title/pageid; produces ordered `{ pageId, sourceTitle, displayTitle, order }[]` chapter descriptors capped at 200.

### TDD Phases

1. **Red — 5 min:** 添加阿拉伯数字、中文数字、卷/篇、上中下、辅助页和嵌套子页 fixture，断言筛选与自然顺序。
2. **Confirm Red — 2 min:** 运行定向测试，确认章节分类器和中文数字解析尚不存在。
3. **Green — 5 min:** 实现 `allpages` continuation、直接子页限制、章节模式分类、中文数字转换和稳定排序键。
4. **Limits — 3 min:** 添加 200 章通过、201 章返回 `ONLINE_BOOK_TOO_MANY_CHAPTERS` 的测试和最小实现。
5. **Refactor — 3 min:** 将分类与排序 helper 保持为纯函数，运行全部 `wikisource.test.ts` 和 typecheck。

## Batch 4: 简体正文提取与整本内存组装

**Depends on:** Batch 3

**Files:** `server/src/wikisource.ts`, `server/test/wikisource.test.ts`, `server/src/onlineBookService.ts`

**Interfaces:** Consumes ordered chapter descriptors; produces fully validated `Book` metadata and `Chapter[]` before any repository call.

### TDD Phases

1. **Red — 5 min:** 添加 `zh-hans` TextExtracts fixture，覆盖繁转简、导航行清除、空段落、批次缺页和正文段落生成。
2. **Confirm Red — 2 min:** 运行定向测试，确认正文批量获取和清洗函数缺失。
3. **Green — 5 min:** 实现每批 20 页、最多三路并发的 extracts 请求，按空行拆段并构建稳定 Chapter/Block ID。
4. **Limits — 4 min:** 添加正好 20 MB 通过、超过 20 MB 失败、无正文失败测试，并确保失败前没有 repository 调用。
5. **Refactor — 4 min:** 统一超时和错误映射，运行 Wikisource 全部测试、聚合测试和服务端 typecheck。

## Batch 5: 路由、原子持久化与来源归属

**Depends on:** Batch 1, Batch 4

**Files:** `server/src/index.ts`, `server/src/onlineBookService.ts`, `server/src/repository.ts`, `server/src/supabaseClient.ts`, `server/src/types.ts`, `server/test/onlineBookAggregation.test.ts`, `server/test/onlineBooks.test.ts`, `supabase/schema.sql`

**Interfaces:** Consumes complete provider import result; produces `POST /online-books/import` source dispatch and atomic RPC support for `p_source_attribution`.

### TDD Phases

1. **Red — 4 min:** 添加 `wikisource` 路由接受、未知来源拒绝、按来源分派、重复导入和 attribution row 映射测试。
2. **Confirm Red — 2 min:** 运行服务端测试，确认路由仍只接受 Gutenberg 且 RPC 缺少 attribution。
3. **Green — 5 min:** 扩展 import 分派、Book/BookRow 映射、repository RPC 参数和 schema 列/函数，使定向测试通过。
4. **Atomicity — 4 min:** 用 mock repository 断言远程解析失败和限制失败不会调用 RPC，并检查 schema 函数仍在单事务内插入书籍与章节。
5. **Regression — 5 min:** 运行 `npm run typecheck`、`npm test` 和 `npm run build`，修复仅由接口扩展引起的回归。

## Batch 6: 移动端多书源展示与导入请求

**Depends on:** Batch 1, Batch 5

**Files:** `mobile/src/types/app.ts`, `mobile/src/api/client.ts`, `mobile/src/screens/ImportScreen.tsx`, `mobile/App.tsx`

**Interfaces:** Consumes `OnlineBookSearchPage.sourceErrors` and `OnlineBook.source`; produces import request `{ source, sourceBookId, visualStyle }` and source-labelled result cards.

### TDD Phases

1. **Red — 4 min:** 添加或扩展移动端脚本测试，断言来源标签映射、部分失败文案和导入请求必须包含 `source`。
2. **Confirm Red — 2 min:** 运行定向移动端测试，确认类型和现有 client 不支持新字段。
3. **Green — 5 min:** 扩展 app types/client，并在 `ImportScreen` 显示书源标签与非阻断 `sourceErrors` 提示。
4. **Flow — 4 min:** 修改 `App.tsx`，确保选择 Wikisource 结果后保存来源并使用该来源导入，Gutenberg 流程保持不变。
5. **Regression — 5 min:** 运行 `npx tsc --noEmit`、现有三个移动端脚本测试和新增定向测试。

## Batch 7: 文档与真实《红楼梦》验收

**Depends on:** Batch 5, Batch 6

**Files:** `server/README.md`, `docs/decisions.md`, `docs/supabase-setup.md`, `docs/e2e-validation-v6-wikisource.md`

**Interfaces:** Consumes最终 HTTP、schema 和移动端行为；produces可复现验证命令、限制说明和验收证据，不新增运行时接口。

### Verification Phases

1. **Baseline — 3 min:** 记录验证前提交、环境模式和 schema 版本，确认测试使用的 Supabase 项目已执行最新 `schema.sql`。
2. **Search — 5 min:** 启动本地 API，搜索“红楼梦”，记录根作品 pageid、规范 URL、书源标签和章节发现数量。
3. **Import — 5 min:** 使用固定测试风格调用整本导入，验证章节顺序、第一回简体正文、`source_attribution` 和重复导入结果。
4. **Full Regression — 5 min:** 运行服务端 typecheck/test/build、移动端 typecheck/脚本测试、Worker unittest 和 `git diff --check`。
5. **Document — 5 min:** 将真实结果、耗时、失败点和清理方式写入验证文档，并更新 README、决策和 Supabase 设置说明。

## Completion Gate

- 所有 10 条规格需求均由 Requirement Mapping 覆盖。
- 服务端 typecheck、全部测试和 build 通过。
- 移动端 typecheck、现有测试和新增多书源测试通过。
- Worker unittest 通过，确认跨模块无回归。
- 《红楼梦》真实搜索成功；具备测试 Supabase 时完成原子整本导入，否则明确记录仅缺外部数据库迁移授权的阻断证据。
- 工作树不包含密钥、下载正文 fixture、临时日志或未解释的生成文件。

