# Supabase 数据层设置

T8 只建立数据层基础，不上传真实书籍内容，不提交本地密钥。

## 1. 创建项目

1. 在 Supabase 控制台创建一个新项目。
2. 打开 SQL Editor，执行 `supabase/schema.sql`。
3. 在 Storage 中预留以下 bucket 名称：
   - `book-imports`：后续保存用户导入的原始文件，T8 不使用。
   - `scene-images`：后续保存生成插图，T8 不使用。

## 2. 本地环境变量

复制示例文件：

```powershell
cd "F:\codexDemo\Scene Read\server"
Copy-Item .env.example .env
```

填写：

```text
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_SECRET_KEY=你的 Supabase Secret Key
```

注意：`SUPABASE_SECRET_KEY` 只能放在后端本地环境或部署环境，不能放进移动端，也不能提交到仓库。旧变量名 `SUPABASE_SERVICE_ROLE_KEY` 仍然兼容，但后续推荐统一使用 `SUPABASE_SECRET_KEY`。

## 3. API 数据模式

后端启动时会根据环境变量自动选择数据源：

- 有 `SUPABASE_URL` 和 `SUPABASE_SECRET_KEY`：使用 Supabase。
- 没有环境变量：使用本地 mock 数据，写入接口返回 `SUPABASE_NOT_CONFIGURED`。

检查当前模式：

```powershell
Invoke-RestMethod http://localhost:4000/health
```

## 4. T8 已支持的读写

读取：

- `GET /books`
- `GET /books/:bookId`
- `GET /books/:bookId/chapters`
- `GET /chapters/:chapterId`
- `GET /generation-tasks`
- `GET /generation-tasks/:taskId`

写入：

- `POST /books`
- `POST /chapters`
- `POST /generation-tasks`

最小写入示例：

```powershell
Invoke-RestMethod http://localhost:4000/books `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"title":"测试书","currentChapterId":"chapter-test-1"}'
```

## 5. 边界

T8 不处理：

- 用户登录和权限模型
- 真实 TXT / EPUB 解析
- 原始书籍文件上传
- AI 场景识别
- 图片生成和 Storage 写入
