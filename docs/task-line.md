# 阅境 SceneReader 任务线

这份文档用于指导后续 coding。每次开工建议只选择一个任务批次推进，完成后运行验证、汇报改动，再进入下一批。

## 使用方式

每次让 Codex 开始 coding 时，可以这样说：

```text
按照 docs/task-line.md，开始执行 T18.5。
只做本批任务，不提前做后续批次。
完成后运行验证并汇报改了什么。
```

如果某个任务发现范围过大，应先拆分，不要一次性跨多个批次。

## T0：项目基础稳定

目标：确保 Expo App 骨架在项目目录中稳定可运行。

任务：
- 确认 `mobile/` 能启动 Expo
- 确认 TypeScript 校验通过
- 补充移动端运行说明到 README
- 记录推荐 Node 版本

验收：
- `npx tsc --noEmit` 通过
- `npx expo start --web --port 8081` 可打开预览
- README 中有清晰的本地运行步骤

## T1：App UI 结构化

目标：把单文件 `App.tsx` 拆成更可维护的前端结构。

任务：
- 创建 `mobile/src/` 目录
- 拆分页面：书架、导入、风格选择、阅读页
- 拆分 mock 数据
- 拆分基础样式和主题色
- 保持现有 UI 视觉和流程不变

验收：
- 页面表现与当前版本一致
- `App.tsx` 只负责应用入口和页面切换
- `npx tsc --noEmit` 通过

## T2：导航与状态流

目标：让 App 内流程更接近真实应用，而不是简单条件渲染。

任务：
- 引入基础导航结构
- 建立页面路由：书架、导入、风格选择、阅读
- 定义 App 内状态：当前书籍、当前章节、选择的风格
- 保持 mock 数据驱动

验收：
- 能从书架进入阅读
- 能从导入进入风格选择，再进入阅读
- 返回行为符合当前原型
- `npx tsc --noEmit` 通过

## T3：阅读页体验增强

目标：让阅读页成为第一版核心体验的稳定基础。

任务：
- 优化长文本阅读布局
- 拆分正文段落、生成中卡片、插图卡片组件
- 支持字号调整
- 支持主题切换
- 支持阅读进度展示

验收：
- 阅读页可以展示多段 mock 正文
- 生成中占位和已生成插图都能稳定显示
- 字号和主题切换可见
- `npx tsc --noEmit` 通过

## T4：本地 mock 书籍模型

目标：建立接近真实业务的数据结构，为后端接入做准备。

任务：
- 定义 Book、Chapter、SceneImage、GenerationTask 类型
- 用 mock 数据模拟多本书、多章节
- 书架展示来自 mock 数据
- 阅读页展示当前章节数据
- 插图状态来自 mock task/image 数据

验收：
- 切换不同书籍能看到不同标题和章节内容
- 阅读页不再写死单章文本
- 数据结构能映射到后续 Supabase 表设计
- `npx tsc --noEmit` 通过

## T5：本地导入入口占位

目标：先实现导入流程的 UI 和状态，不接真实文件解析。

任务：
- 导入页模拟选择本地书籍
- 创建导入成功状态
- 新导入书籍出现在书架
- 风格选择结果绑定到导入书籍

验收：
- 点击“从文件中导入”后能进入风格选择
- 完成风格选择后，书架出现新书或进入阅读
- 不接真实 TXT / EPUB 文件
- `npx tsc --noEmit` 通过

## T6：后端 API 骨架

目标：创建后端基础服务，但不接 AI。

任务：
- 创建 `server/` 目录
- 初始化 Node.js / TypeScript API
- 设计基础接口：books、chapters、generation-tasks
- 使用本地 mock 或内存数据返回
- 编写后端 README

验收：
- 后端服务能本地启动
- App 暂时不必须接后端
- API 返回结构与前端 mock 类型一致
- 后端 TypeScript 校验通过

## T7：App 接入本地 API

目标：让 App 从 API 获取书籍和章节数据。

任务：
- 增加 API client
- 书架从后端获取 books
- 阅读页从后端获取 chapter
- 任务状态从后端获取 generation task
- 保留 mock fallback

验收：
- 后端启动时，App 使用后端数据
- 后端不可用时，有清晰降级或错误提示
- 前后端类型结构一致
- 前端 TypeScript 校验通过

## T8：Supabase 数据层

目标：引入真实数据库和文件存储基础。

任务：
- 建立 Supabase 项目配置说明
- 创建数据库 schema 草案
- 接入 Supabase client
- 实现 books / chapters / generation_tasks 基础读写
- 不上传真实书籍内容到公开仓库

验收：
- 本地环境变量不提交
- 数据表结构和 `docs/technical-selection.md` 一致
- API 能读写 Supabase 测试数据

## T9：TXT / EPUB 导入解析

目标：实现真实本地书籍导入的第一版。

任务：
- App 选择 TXT / EPUB 文件
- 读取文件基础信息
- TXT 解析为章节
- EPUB 解析为章节
- 章节内容提交后端或本地缓存

验收：
- 至少一个 TXT 样本可导入并阅读
- 至少一个 EPUB 样本可导入并阅读
- 失败状态有基础提示

## T10：Python Worker 骨架

目标：创建 AI 任务处理服务框架。

任务：
- 创建 `worker/` 目录
- 初始化 Python 项目
- 定义任务输入输出格式
- 实现章节文本到场景候选的占位逻辑
- 将结果回写 API 或数据库

验收：
- Worker 可本地运行
- 输入一章文本，能输出候选场景结构
- 暂不要求真实 AI 质量

## T11：AI 场景识别

目标：接入真实 AI，识别地点或环境变化。

任务：
- 设计场景识别 prompt
- 输入章节文本
- 输出地点变化、原文片段、插图位置、prompt 草案
- 增加结果校验和日志

验收：
- 能对现代中文小说章节输出可解释的场景候选
- 结果结构可被 App 阅读页消费
- 不强行处理同地点情绪变化

## T12：图片生成闭环

目标：生成场景图并插入阅读页。

任务：
- 接入生图 API 或可替换 image provider
- 将场景 prompt 发送到生图服务
- 保存图片到 Supabase Storage
- 回写 `scene_images`
- App 展示图片

验收：
- 一个章节可生成至少一张插图
- 图片生成中状态和完成状态都能在 App 显示
- 图片 URL / 缓存逻辑稳定

## T13：端到端体验验证

目标：验证第一版产品链路是否成立。

任务：
- 从导入书籍到阅读插图完整跑通
- 记录耗时、失败点、图片质量问题
- 整理体验问题清单
- 更新 `docs/decisions.md`

验收：
- 能演示完整主流程
- 有明确的问题记录
- 能判断下一步是优化体验、优化 AI，还是补基础设施

## T14：导入书籍持久化到后端

目标：导入 TXT / EPUB 后，不只存在 App 本地状态，而是写入 Supabase。

任务：
- App 导入完成后调用 API 创建 book 和 chapters
- 后端保存书籍、章节、章节 blocks
- App 使用后端返回的 book/chapter 进入阅读页
- 保留本地 fallback，后端失败时仍能阅读本地导入内容
- 修复 PowerShell / 乱码造成的测试数据污染，确保中文标题和正文 UTF-8 正常

验收：
- 导入一本 TXT 后，刷新 App 仍能在书架看到这本书
- 阅读页能从后端读取导入章节正文
- `server` typecheck / build 通过
- `mobile` typecheck 通过

## T15：生成任务 API 与状态模型

目标：让 App 能正式提交章节生成任务，而不是本地直接插入图片。

任务：
- 新增 API：提交章节生成任务
- `generation_tasks` 支持任务类型、状态、错误信息、进度、关联 book/chapter
- 后端创建任务后返回 task id
- App 导入完成进入阅读页时自动提交第一章生成任务
- 阅读页展示真实任务状态：排队、识别中、生图中、完成、失败

验收：
- 导入新书后，阅读页先显示“场景图生成中”
- 后端能查询任务状态
- 任务失败时 App 有明确提示，不影响继续阅读

## T16：Worker 调度闭环

目标：让 Worker 从后端任务中拿章节文本，完成 AI 识别和生图，再回写结果。

任务：
- Worker 支持通过 task id 从 API 拉取章节 payload
- Worker 处理流程：读取任务 -> Kimi 场景识别 -> 生图 -> 上传 Storage -> 写入 `scene_images` -> 更新任务完成
- 后端提供 Worker 专用接口：领取任务、更新进度、提交图片、记录错误
- 第一版先用手动命令触发 Worker，不引入复杂队列服务

验收：
- 运行一条 Worker 命令即可处理一个真实导入章节
- `scene_images` 写入 imageUrl
- `generation_tasks` 从 queued/generating 变为 completed

## T17：App 轮询刷新与阅读页插图落位

目标：用户导入后停留在阅读页，等待一会儿就能看到生成图自动出现。

任务：
- App 在阅读页轮询当前章节任务和 scene images
- 任务完成后自动刷新插图
- 图片插入位置优先使用 Worker 输出的 sourceBlockId / position
- 未返回插入位置时，降级显示在当前章节前几段后
- 移除“导入后本地直接生成 pollinations URL”的临时体验逻辑，改为真实任务链路
- 本地开发后端提交任务后自动触发 Worker

验收：
- 导入新书后无需手动刷新，生成图自动出现在阅读页
- 生成中和完成状态都能看到
- 退出再进入阅读页仍能看到已生成图片

## T18：AI 与生图质量验证

目标：判断真实 AI 生成效果是否支撑产品方向。

任务：
- 准备 3-5 个中文小说章节样本
- 对比 Kimi 场景识别结果：是否选对地点/环境变化，是否避免情绪转折误判
- 对比生图结果：是否符合原文、是否克制、是否有文字水印、是否干扰阅读
- 记录问题到体验验证文档
- 调整场景识别 prompt 和生图 prompt
- 支持 Kimi coding endpoint 的 Anthropic-compatible 协议

验收：
- 每个样本有候选位置、prompt、图片、人工评价
- 明确下一步是优化 prompt、换生图服务，还是先优化 App 体验
- Kimi K3 能通过 `worker/.env` 配置跑通

## T18.5：App 生成调试页与候选场景入库

目标：在进入失败重试和成本控制前，先让用户能在 App 内看到“一章文章的插图占位位置”和“生图 prompt”，用于判断 Kimi 场景识别是否合理、prompt 是否需要调整。

任务：
- 新增 `scene_candidates` 数据模型和 Supabase schema，关联 generation task、book、chapter
- Worker 在 Kimi 场景识别后，将全部候选写入 `scene_candidates`
- 后端新增 scene candidates 查询 API，支持按 chapter/task 读取候选列表
- App 阅读页右上角菜单增加“生成调试”入口，仅针对当前章节
- 新增 App 内生成调试页，展示当前章节全部候选：
  - 候选顺序
  - sourceBlockId / position
  - 命中原文片段
  - Kimi 识别理由 / locationChange / confidence
  - promptDraft
  - 最终生图 prompt
  - 已生成图片与候选关系
  - 当前最终生成规则
  - provider / model / promptVersion
- 折叠展示 Kimi 原始返回 JSON
- 支持复制 promptDraft
- 支持复制最终生图 prompt
- 调试页内高亮来源原文片段
- 调试页只读，不支持编辑 prompt、重新生成、选择最终候选
- 后端做兼容：没有 `scene_candidates` 表时不崩溃，调试页显示空/提示
- 开发阶段默认显示入口，后续生产环境可用开关关闭

验收：
- 导入一本 TXT 后，等待生成完成，在阅读页可进入“生成调试”
- 调试页能看到当前章节全部候选位置和 prompt
- 已生成图片能对应到候选；未生成图片的候选也不会丢失
- 复制 prompt 可用
- 返回阅读页后，正式阅读展示不受调试页影响
- 刷新 App 后，调试页仍可从后端读取候选数据
- `server` typecheck / build 通过，`mobile` typecheck 通过，worker unittest 通过

边界：
- 本批不做 prompt 编辑和重新生成
- 本批不做失败重试和成本控制
- 本批不做多图生成策略调整
- 本批不接真实生图服务，继续沿用当前 image provider

## T19：任务失败、重试与成本控制

目标：避免真实 AI 调用后出现不可控成本和失败体验。

任务：
- 给任务增加失败原因和重试入口
- 限制每章默认生成图片数量，第一版默认 1 张
- 对同一章节重复提交做去重
- App 提供“重新生成”入口，但不自动无限重试
- 后端记录 AI 调用耗时和 provider

验收：
- 网络失败/API 失败不会让 App 崩溃
- 同一章节不会重复生成大量图片
- 可以手动重试失败任务

## T20：手机端真实预览稳定化

目标：让 iOS / Android 真机可以稳定看完整流程。

任务：
- 把 API 地址从硬编码 `localhost` 改为环境配置
- 提供局域网 IP 配置说明
- Expo Go / Dev Client 预览文档补齐
- 验证 iOS 和 Android 都能访问后端、加载图片 URL
- 记录移动端图片加载兼容问题

验收：
- 手机扫码后能导入书籍、进入阅读、看到生成中和生成完成图片
- README 有清晰真机预览步骤
- Web、iOS、Android 三端基础体验一致

## 默认验证命令

每个任务批次默认验证：

- `mobile`: `npx tsc --noEmit`
- `server`: `npm run typecheck` 和 `npm run build`
- `worker`: Python unittest
- 涉及前端展示时运行 `npx expo export --platform web`
- 涉及 Supabase 时，至少验证一次 API 写入和读取

## 提交节奏

建议每个任务批次完成后提交一次。

提交信息格式：

```text
feat: implement T18.5 scene debug page
```

每次提交前至少运行相关校验。

## 当前推荐下一步

从 **T18.5：App 生成调试页与候选场景入库** 开始。

T18.5 完成后，再进入 **T19：任务失败、重试与成本控制**。继续保持每次只做一个任务批次，不提前做后续批次。
## T21：多图生成与类型化策略

目标：让每章图片数量从固定 1 张升级为按章节长度自动生成 1-3 张，并区分场景、人物、物品三类视觉锚点。图片仍服务阅读理解，阅读页保持干净，调试页展示类型、选择理由和 prompt。

任务：
- 新增图片类型模型：`scene`、`character`、`object`
- 更新 Supabase schema：`scene_candidates.image_type`、`scene_images.image_type`
- 更新后端、移动端、Worker 类型：`SceneCandidate.imageType`、`SceneImage.imageType`
- 更新 AI 场景识别 prompt，让候选视觉锚点输出 `imageType`、阅读帮助理由、候选置信度
- Worker 根据章节段落数计算目标图片数量：
  - 少于 20 段：1 张
  - 20-50 段：2 张
  - 超过 50 段：3 张
- Worker 筛选候选时综合阅读帮助度、置信度、插入位置分布和类型多样性
- 生成 2-3 张时，尽量避免全部为同一图片类型
- 生图 prompt 按类型拼接不同模板：
  - `scene`：强调地点、空间、环境、光线、时代感
  - `character`：强调人物姿态、服装、关系，不做证件照式正脸
  - `object`：强调物品材质、位置和剧情意义
- 所有类型统一加入负面约束：避免文字、水印、漫画分镜文字、畸形手脸
- App 阅读页支持同章多张图按 `sourceBlockId` 落位
- 缺少落位信息时，按章节 30% / 60% / 85% 附近降级插入，避免多张图连续挤在一起
- App 调试页展示 `imageType`、选择理由、prompt、图片与候选关系
- 用户进入后续章节时，如果该章没有图片且没有任务，则提交该章生成任务
- 继续沿用 T19 的任务去重、最多 3 张、失败手动重试和 provider / durationMs 记录

验收：
- 短章节默认生成 1 张，中等章节默认生成 2 张，长章节默认生成 3 张
- `scene_candidates` 和 `scene_images` 都能保存并返回 `imageType`
- 生成调试页能看到每个候选和最终图片的类型、原因、prompt
- 阅读页能展示同章多张图，且图片尽量出现在相关原文附近
- 进入一个未生成图片的后续章节时，会自动提交该章任务并显示生成状态
- 同一章节不会因为重复进入阅读页而重复生成大量图片
- `server` typecheck / build 通过，`mobile` typecheck 通过，`worker` unittest 通过

边界：
- 本批不做全书预生成
- 本批不做角色跨章节一致性档案
- 本批不做手动编辑 prompt
- 本批不做单张图重新生成
- 本批不切换或对比生图 provider，继续使用当前 GLM provider
- 本批不做复杂图片质量评分系统
