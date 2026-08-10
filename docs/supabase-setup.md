# Supabase 数据层设置

本文最初记录 T8 数据层基础，现同时维护 V6 在线整本导入所需 schema 迁移。不向仓库上传真实书籍内容，也不提交本地密钥。

## 1. 创建项目

1. 在 Supabase 控制台创建一个新项目。
2. 打开 SQL Editor，执行 `supabase/schema.sql`。
3. 在 Storage 中预留以下 bucket 名称：
   - `book-imports`：后续保存用户导入的原始文件，T8 不使用。
   - `scene-images`：后续保存生成插图，T8 不使用。
   - `book-covers`：保存在线导入书籍的封面。

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

## 5. T8 边界（历史范围）

T8 不处理：

- 用户登录和权限模型
- 真实 TXT / EPUB 解析
- 原始书籍文件上传
- AI 场景识别
- 图片生成和 Storage 写入

## 6. V6 在线整本导入 schema 迁移

V6 多书源导入要求 `books` 保存稳定书源归属，并继续由单个 RPC 原子写入书籍及全部章节。部署或本地连接已有 Supabase 项目时，必须重新执行当前仓库的 `supabase/schema.sql`。

本次 schema 变更包括：

- `books.source_attribution text null`；
- 保留 `(source, source_book_id)` 唯一索引，继续兼容 Gutenberg；
- 删除旧签名并重新创建 `import_online_book`；
- 新 RPC 参数 `p_source_attribution text default null`；
- RPC 在同一事务中写入 book、chapters 和稳定的 `chapter_order`。

迁移步骤：

1. 在 Supabase SQL Editor 中打开并完整执行仓库根目录的 `supabase/schema.sql`。
2. 不要只单独增加列：PostgREST 仍可能暴露旧 RPC 签名，导致导入参数不匹配。
3. 执行后刷新 PostgREST schema cache，或等待项目自动刷新。
4. 使用下面的只读 SQL 检查列和函数参数：

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'books'
  and column_name = 'source_attribution';

select pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'import_online_book';
```

预期第一条返回 `source_attribution / text / YES`，第二条函数签名包含 `p_source_attribution text`。迁移前不要调用在线整本导入；搜索不依赖该迁移，仍可只读使用。

2026-08-10 的 W7 只读检查发现当前配置项目尚无 `books.source_attribution`（PostgreSQL `42703`）。本批没有执行远程迁移或写入；需要项目维护者明确执行最新 schema 后，再进行整本原子导入验收。详见 `docs/e2e-validation-v6-wikisource.md`。
