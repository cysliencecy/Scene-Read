# T13 端到端体验验证记录

日期：2026-07-22

## 验证目标

验证第一版产品链路是否成立：从书籍/章节进入阅读，到 Worker 识别场景、生成图片、服务端保存图片、App 读取并展示真实图片 URL。

## 验证范围

本批只验证 T13，不新增后续功能。

已覆盖：

- 后端以 Supabase 模式启动。
- 创建一条测试书籍和测试章节。
- Worker 读取章节 payload。
- Worker 输出场景候选。
- Worker 生成 1 张图片数据。
- Worker 回调 API。
- API 上传图片到 Supabase Storage。
- API 写入 `scene_images`。
- App 数据结构可消费 `imageUrl` 并展示真实图片。

未覆盖：

- App 内一键触发 Worker。
- 真实 Kimi 场景识别质量评估。
- 真实商业生图模型质量评估。
- 用户账号、权限和多用户隔离。

## 验证环境

- API：`http://localhost:4013`
- API 数据模式：Supabase
- Worker 图片生成：`mock-svg`
- 测试输入：`worker/samples/chapter-input.json`
- 测试输出：`worker/.tmp/t13-worker-result.json`
- 图片存储 bucket：`scene-images`

## 验证步骤

1. 启动后端：

```powershell
cd "F:\codexDemo\Scene Read\server"
$env:PORT="4013"
npm run dev
```

2. 确认健康检查：

```powershell
Invoke-RestMethod -Uri "http://localhost:4013/health"
```

结果：`dataMode` 为 `supabase`。

3. 创建测试书籍和章节。

测试章节 ID：`chapter-sample-1`

4. 运行 Worker：

```powershell
cd "F:\codexDemo\Scene Read"
$env:PYTHONPATH="F:\codexDemo\Scene Read\worker\src"
python -m scene_reader_worker --input worker\samples\chapter-input.json --provider heuristic --generate-images --image-provider mock-svg --max-images 1 --api-url http://localhost:4013 --output worker\.tmp\t13-worker-result.json
```

5. 读取场景图片：

```powershell
Invoke-RestMethod -Uri "http://localhost:4013/scene-images"
```

结果：读到 `chapter-sample-1-scene-1-image`，包含公开 `imageUrl`。

6. 校验图片 URL。

结果：图片 URL 返回 `200`，`Content-Type` 为 `image/svg+xml`。

## 结果

第一版链路成立。

当前可演示的主流程是：

```text
章节文本 -> Worker 场景候选 -> 场景 prompt -> 图片生成 -> API 回写 -> Supabase Storage -> scene_images -> App 阅读页展示 imageUrl
```

## 耗时记录

- Worker 单元测试：小于 1 秒。
- Worker mock-svg 图片生成和 API 回写：约 2 秒。
- 服务端 TypeScript 校验：约 3 秒。
- 移动端 TypeScript 校验：约 4-5 秒。
- Expo Web export：约 29 秒。

真实 Kimi 和真实生图耗时未在本批测量。

## 失败点记录

1. 首次 Worker 回写图片失败。

原因：`scene_images.chapter_id` 有外键约束，测试章节 `chapter-sample-1` 尚未写入 Supabase。

处理：先通过 API 创建测试书籍和章节，再重跑 Worker，回写成功。

2. PowerShell 构造中文 JSON 时出现编码破坏。

原因：PowerShell 输出中文和特殊引号时会破坏请求体。

处理：改用 Python 3 读取 UTF-8 文件并 POST。

3. PowerShell `Invoke-WebRequest -Method Head` 读取图片 URL 时出现响应对象错误。

处理：改用 Python urllib GET 图片前 64 字节，确认返回 `200 image/svg+xml`。

## 图片质量问题

当前 T13 使用 `mock-svg` 验证闭环，不代表真实图片质量。

已知限制：

- mock-svg 只能证明“图片数据可生成、上传、读取、展示”，不能验证美术质量。
- App mock 图片使用外部 Unsplash URL，仅用于界面可视化，不是模型生成结果。
- 下一步如果接真实生图模型，需要单独评估人物一致性、现代中文小说场景理解、构图克制程度、是否出现文字水印。

## 体验问题清单

- App 还不能从阅读页主动触发 Worker 任务。
- App 还没有轮询 generation task 和 scene image 完成状态。
- 导入本地书后，章节尚未自动进入云端处理队列。
- 图片生成中状态目前主要依赖 mock task，未和真实 Worker 任务进度绑定。
- Supabase 写入前必须确保 book/chapter 已存在，否则图片回写会被外键拒绝。
- 真实 AI key、图片生成 provider、任务队列还没有统一配置面板或运维说明。

## 下一步判断

优先补基础设施，而不是马上优化 UI 或图片质量。

建议下一批先做：

- App/后端增加“提交章节生成任务”的接口。
- 后端维护 generation task 状态。
- Worker 从 API 拉取任务或由后端调度 Worker。
- App 轮询任务状态并刷新 scene images。

原因：现在链路已经证明能跑通，但触发、进度、重试和状态刷新还没有产品化。先补这层，后续再优化 AI prompt 和真实生图质量才更稳。
