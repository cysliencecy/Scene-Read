# 中文维基文库整本导入设计

## Context

当前服务端在 `gutendex.ts` 和 `onlineBookService.ts` 中直接耦合 Gutenberg：搜索只调用一个 provider，导入路由只接受 `source=gutenberg`，共享类型也把 `source` 限定为单一字面量。移动端已经具备在线搜索、选择风格和导入后的阅读流程，因此本次不重做页面结构，而是扩展数据与服务边界。

现有 Supabase `import_online_book` RPC 已在单个数据库事务中创建书籍和全部章节，能够满足整本导入的原子性。该 RPC 目前不保存许可归属文本，需要增加兼容字段和参数。

中文维基文库使用 MediaWiki 页面模型：作品根页位于主命名空间，章节通常是 `作品名/章节名` 直接子页。真实 API 验证表明 `action=parse&variant=zh-cn` 不会可靠转换正文；`variant=zh-hans` 能将正文转换为简体，`action=query&prop=extracts&explaintext=1&exlimit=max` 能批量返回纯文本，但仍包含“回目录”“上一回”“下一回”等导航行，需要服务端过滤。

利益相关方包括阅读中文作品的用户、维护书源适配的开发者以及负责来源与许可合规的项目维护者。外部约束是 MediaWiki API 可用性、请求速率、页面结构差异和作品许可标注差异。

## Goals

- 在不破坏 Gutenberg 行为的前提下建立可继续扩展的多书源边界。
- 统一搜索中文维基文库和 Gutenberg，并允许单个书源降级。
- 把维基文库作品根页和直接章节子页稳定映射为现有 Book/Chapter 模型。
- 保存简体中文可阅读正文、稳定来源标识、规范 URL 和归属信息。
- 在持久化前完成所有远程读取、解析和限制校验，保持数据库原子性。
- 用自动化 fixture 覆盖边界行为，并用《红楼梦》执行只读搜索和受控真实导入验收。

## Non-Goals

- 不支持现代商业书源、付费内容或绕过访问限制。
- 不构建通用 MediaWiki 阅读器，不保留模板、脚注交互和复杂排版。
- 不增加繁简切换、单章选择、后台队列或导入进度协议。
- 不为正文不存在直接章节子页的任意页面集合自动猜测跨页面关系。

## Decisions

### Decision 1: 使用显式 provider 接口和聚合服务

**Choice**

新增 `OnlineBookProvider` 接口，至少提供 `source`、`search(query, page)` 和 `importBook(sourceBookId, visualStyle)`。Gutenberg 现有逻辑包装为 provider，中文维基文库实现第二个 provider。`onlineBookService` 负责并行搜索、失败聚合、导入分派和已导入 ID 回填。

统一类型增加：

```ts
type OnlineBookSource = 'gutenberg' | 'wikisource';
type OnlineBookSourceError = { source: OnlineBookSource; code: string };
type OnlineBookSearchPage = {
  items: OnlineBook[];
  page: number;
  total: number;
  hasNextPage: boolean;
  sourceErrors: OnlineBookSourceError[];
};
```

**Rationale**

书源差异被限制在 provider 内，HTTP 路由、移动端和持久化只依赖统一模型。未来增加合法书源无需再次把 Gutenberg 条件分支复制到各层。

**Alternatives considered**

- 在现有函数里直接增加 `if (source === 'wikisource')`：改动较少，但搜索、下载、错误和测试会继续耦合。
- 为每个书源建立独立 HTTP 路由：服务端简单，但移动端无法自然提供统一搜索，也会重复交互逻辑。

### Decision 2: 聚合搜索并允许部分失败

**Choice**

服务端使用 `Promise.allSettled` 并行请求两个 provider。成功结果按“中文维基文库在前、Gutenberg 在后”拼接；`total` 为成功书源总数，`hasNextPage` 为任一成功书源仍有下一页，失败项写入 `sourceErrors`。只有没有任何成功 provider 时抛出 `BOOK_SOURCE_UNAVAILABLE`。

每个 provider 使用相同的逻辑页码。结果只在各自书源内保证稳定顺序，不承诺跨书源相关性排序。

**Rationale**

中文需求优先，同时保留现有 Gutenberg 能力。单源故障不应阻断全部搜索，移动端已有错误区域，可扩展为非阻断提示。

**Alternatives considered**

- 任一书源失败则整个请求失败：实现简单但可用性差。
- 建立跨书源相关性评分：结果更精细，但需要不可验证的评分规则，超出本次范围。
- 使用游标统一分页：最准确，但需要改造当前页码 API 和移动端加载更多协议。

### Decision 3: 使用根页面 ID 作为稳定作品标识

**Choice**

维基文库搜索限定主命名空间。搜索命中 `根标题/子页` 时先截取根标题，批量解析根页面，使用根页面 `pageid` 字符串作为 `sourceBookId`，规范 full URL 作为 `sourceUrl`。同一页搜索结果按根 `pageid` 去重。

**Rationale**

页面标题可能因繁简转换或移动而变化，page ID 比标题稳定；根页归并能防止把每一回显示成一本书。

**Alternatives considered**

- 使用根标题作为 ID：可读但改名后会重复导入。
- 保留每个搜索命中页面：不能满足整本导入模型。

### Decision 4: 直接子页发现、章节分类和自然排序

**Choice**

通过 `list=allpages` 和 continuation 枚举 `根标题/` 前缀。只保留主命名空间且去掉根前缀后不再包含 `/` 的直接子页。章节分类器接受以下可解释模式：

- `第<阿拉伯数字或中文数字><回|章|节|卷>`；
- `<卷|篇|部><阿拉伯数字或中文数字>`；
- `上卷/中卷/下卷`、`上篇/中篇/下篇`。

明确排除包含“目录、版本、说明、校勘、序、跋、附录、版权”的辅助标题。排序键依次为章节模式类别、解析后的数字或上中下序号、规范标题；无法分类的直接子页不导入。

**Rationale**

规则可测试、可解释，覆盖章回小说和常见分卷结构，同时避免把维基维护页猜成正文。

**Alternatives considered**

- 导入所有直接子页：覆盖面更大，但会混入说明和版本页。
- 依赖页面分类或模板：语义更强，但模板在作品间不统一且需要大量特例。
- 递归导入任意深度：可能重复内容并超出“作品直接章节”边界。

### Decision 5: 批量获取 `zh-hans` 纯文本并在服务端清洗

**Choice**

使用 `action=query&prop=extracts&explaintext=1&exsectionformat=plain&exlimit=max&variant=zh-hans`，每批最多 20 个章节标题。批次最多 3 路并发，每个请求 15 秒超时；任一批次失败则整本导入失败。

文本按空行拆段，清除空白、MediaWiki 残留标题标记和独立导航行；不删除普通正文中的“上一回”等自然语言。书名和章节标题使用 API 返回的 `zh-hans` 规范显示文本。累计大小按最终段落 UTF-8 字节计算。

**Rationale**

TextExtracts 已完成 HTML 到纯文本和语言转换，避免引入 HTML DOM 依赖；批量请求将《红楼梦》约 120 回控制在少量 API 调用内。

**Alternatives considered**

- 每章调用 `action=parse` 再用 HTML parser：结构控制更细，但 120 章需要大量请求并新增依赖。
- 服务端引入 OpenCC：可独立转换，但 MediaWiki 已能针对其模板和内容执行官方语言变体转换。
- 抓取网页 HTML：容易受页面布局变化影响，也扩大受信 URL 面。

### Decision 6: 延用数据库 RPC 保持原子导入

**Choice**

所有章节在内存中完成发现、抓取、清洗、200 章限制和 20 MB 限制后，复用并扩展 `import_online_book` RPC 一次写入。`books` 增加可空 `source_attribution` 字段，RPC 增加对应参数；旧 Gutenberg 调用传入其既有来源说明或 `null`。

维基文库书籍使用：

- `source = 'wikisource'`
- `sourceBookId = 根页面 pageid`
- `sourceUrl = 根页面规范 URL`
- `copyrightStatus = 'authorized'`
- `sourceAttribution = '来源：中文维基文库；作品版权与许可状态以来源页标注为准'`

唯一索引 `(source, source_book_id)` 继续负责并发去重。

**Rationale**

现有 RPC 已提供事务语义，扩展它比在 Node.js 中补偿删除可靠。将版权状态设为 `authorized` 表示内容由兼容许可的平台提供，而不武断声称每部作品都属于公有领域；来源页仍是最终许可依据。

**Alternatives considered**

- 标记所有维基文库作品为 `public_domain`：对原创翻译或授权文本不准确。
- 标记为 `unknown`：过于保守，无法表达来源平台允许再利用，但仍保留来源归属字段。
- 分批写入章节：内存较低，但失败会留下部分数据并违反规格。

### Decision 7: 严格限制 API 目标与导入规模

**Choice**

默认 API 为 `https://zh.wikisource.org/w/api.php`。可选环境变量 `WIKISOURCE_API_URL` 必须使用 HTTPS 且 hostname 精确为 `zh.wikisource.org`；正文仅从该 API JSON 响应读取，不跟随正文中的链接。

发现第 201 个有效章节时立即返回 `ONLINE_BOOK_TOO_MANY_CHAPTERS`。解析期间累计最终段落字节，超过 20 MB 立即返回 `BOOK_DOWNLOAD_TOO_LARGE`。发生限制或远程错误时不得调用持久化 RPC。

**Rationale**

这同时控制内存、请求数量、数据库负载和 SSRF 面，且限制可以在测试中精确验证。

**Alternatives considered**

- 允许任意 MediaWiki 域名：扩展性高但扩大 SSRF 和内容许可范围。
- 导入时截断到 200 章或 20 MB：会产生看似成功但不完整的书籍。

## Data Flow

```text
移动端查询
  -> GET /online-books/search
  -> 聚合服务并行调用 Gutenberg + Wikisource
  -> 统一结果（含 sourceErrors）
  -> 用户选择 Wikisource 作品
  -> POST /online-books/import { source, sourceBookId, visualStyle }
  -> Wikisource provider 读取根页与直接子页
  -> 分类、自然排序、批量获取 zh-hans 纯文本
  -> 清洗、章节/大小校验
  -> import_online_book RPC 原子写入
  -> 返回 Book + Chapters
  -> 移动端进入阅读页
```

## Error Model

- `BOOK_SOURCE_UNAVAILABLE`：所有搜索书源不可用，或维基文库 API 无响应。
- `ONLINE_BOOK_NOT_FOUND`：根页面不存在。
- `ONLINE_BOOK_HAS_NO_CHAPTERS`：没有符合分类规则的直接章节子页。
- `ONLINE_BOOK_HAS_NO_READABLE_TEXT`：章节存在但没有有效正文。
- `ONLINE_BOOK_TOO_MANY_CHAPTERS`：有效章节超过 200。
- `BOOK_DOWNLOAD_TOO_LARGE`：最终正文累计超过 20 MB。
- `BOOK_SOURCE_URL_REJECTED`：配置不是允许的 HTTPS API。

移动端将搜索 `sourceErrors` 显示为非阻断提示；导入错误沿用现有错误区并增加上述中文文案。

## Testing Strategy

- provider 单元测试：搜索根页归并、continuation、章节分类、中文数字排序、`zh-hans` 正文清洗、限制和 URL 校验。
- 聚合服务测试：双源成功、单源失败、全失败、导入分派、已导入 ID 回填。
- 路由测试：`source=wikisource` 接受，未知来源拒绝，错误状态码稳定。
- repository/schema 测试：attribution 映射、RPC 参数和 Gutenberg 兼容。
- 移动端类型检查与组件行为测试：来源标签、部分失败提示、导入请求携带来源。
- 真实验收：先执行《红楼梦》只读搜索与章节发现；只有测试 Supabase schema 已更新时才执行整本写入，且使用固定测试书籍 ID 便于清理。

## Risks And Trade-Offs

- **页面结构差异**：章节分类规则会漏掉非标准作品。通过明确规则和日志保持可解释性，后续以独立变更扩展规则。
- **同步导入耗时**：整本书仍可能需要数秒至数十秒。批量请求和三路并发降低耗时，但本次不引入后台任务协议。
- **TextExtracts 导航残留**：纯文本仍可能包含导航行。只过滤独立行并用 fixture 回归，避免误删正文。
- **许可状态不完全一致**：统一使用 `authorized` 加来源归属，不宣称所有作品公版；用户可通过规范 URL 查看具体标注。
- **聚合分页不完全均衡**：同一页可能返回两个来源各自一页的合并结果。保持当前页码 API，避免本次扩大到游标协议。
- **外部 API 波动**：自动化测试默认使用 fixture 和 mock fetch；真实验收单独运行，避免 CI 因外部网络不稳定失败。

