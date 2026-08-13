# V6 中文维基文库整本导入验收记录

日期：2026-08-10

> 2026-08-12 更新：本文中“远程 Supabase 尚未迁移、整本持久化尚未实测”的结论已经过时。最新 `supabase/schema.sql` 已执行，并完成了下面记录的受控写入、服务重启恢复、重复导入和清理验证。

## 验收范围与基线

- 分支：`wikisource-whole-book-import`
- 验证前提交：`c10fab2bb27a5897c2cacb6a77f649c3387312a8`
- Node.js：`v23.0.0`
- Python：`3.13.14`
- 真实书源：中文维基文库官方 MediaWiki API
- 固定 API：`https://zh.wikisource.org/w/api.php`
- 查询：`红楼梦`
- 数据库操作：只读 schema 检查；未迁移、未调用导入 RPC、未写入任何书籍

自动化回归使用 fixture/mock fetch；真实 API 验收单独执行，不作为稳定 CI 前置条件。本记录不保存下载正文、密钥或临时响应文件。

## 真实只读验收结果

### 1. 搜索与根作品

使用 `action=query&list=search`、主命名空间、`variant=zh-hans` 和 `SceneReader/0.1` User-Agent 查询。

结果：

- 总命中数：855；本页返回 20 项。
- 首项搜索命中：`紅樓夢`，pageid `7683`。
- 使用 pageid 再解析根页面，确认命名空间为 `0`。
- 根源标题：`紅樓夢`。
- `zh-hans` 显示标题：`红楼梦`。
- 规范页面：`https://zh.wikisource.org/wiki/%E7%B4%85%E6%A8%93%E5%A4%A2`。

结论：搜索可以稳定归并到作品根页面，`sourceBookId=7683` 和规范 HTTPS URL 可用于统一在线书籍模型。

### 2. 直接章节发现与顺序

使用 `list=allpages`、`apprefix=紅樓夢/`、主命名空间和 continuation 完整枚举。

结果：

- 前缀页面数：120。
- 主命名空间直接子页数：120。
- 没有需要递归的更深层子页。
- 第一项：`紅樓夢/第001回`。
- 第十项：`紅樓夢/第010回`。
- 最后一项：`紅樓夢/第120回`。

这些标题全部符合当前 `第<数字>回` 分类规则，补零编号按 1 到 120 的自然顺序排列，低于 200 章上限。

### 3. 第一回 `zh-hans` 正文

使用 `prop=extracts`、`explaintext=1`、`exsectionformat=plain` 和 `variant=zh-hans` 读取 `紅樓夢/第001回`，只记录统计信息，不落盘正文。

结果：

- 页面 pageid：9911。
- 提取字符数：7,343。
- CJK 统一表意字符数：6,219。
- 空行拆分段落数：14，其中长度至少 50 字符的可读段落为 10。
- 第一个可读长段落为 445 字符。
- 简体“贾”“宝”存在；对应繁体“賈”“寶”不存在。

结论：第一回正文可读，官方 `zh-hans` 变体生效。导航清洗和段落模型另由自动化 fixture 测试覆盖。

## Node 网络诊断

项目的 Node `fetch` 在本机无法直接完成真实请求，因此按 `bug-investigator` 只读诊断后改用 PowerShell/Python 请求同一官方 URL，没有修改产品代码。

证据：

| 客户端 | 同一 URL 与请求头结果 |
| --- | --- |
| Node.js 23 built-in `fetch` | 稳定失败；`UND_ERR_CONNECT_TIMEOUT`，尝试直连 `zh.wikisource.org:443`，10 秒超时。 |
| PowerShell `Invoke-RestMethod` | 成功；855 个总命中，首项 pageid 7683。 |
| Python 3.13 `urllib` | HTTP 200；20 项，首项 pageid 7683。 |

环境检查发现 Windows 系统代理配置为本机代理端口，而 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量未配置。PowerShell 和 Python 使用系统代理；Node 23 built-in `fetch` 尝试直连。DNS 同时解析出 IPv4 与 IPv6，代码使用正确的 HTTPS URL、`Accept: application/json`、`SceneReader/0.1` 和 15 秒超时。

根因判断：这是当前验证机“直连外网被阻止、Node 不读取 Windows 系统代理”的环境差异，不是 Wikisource URL、请求头或 provider 代码缺陷。未加入代理特例或降低可信 URL 限制。若要从本机直接启动 Node API 做真实外部请求，应在运行环境层提供 Node 支持的代理配置或允许直连。

## Supabase schema 兼容性与写入边界

通过现有服务端 Supabase 客户端执行只读列查询：

```text
books.select(source_attribution).limit(0)
```

返回 PostgreSQL `42703`：`column books.source_attribution does not exist`。

因此当前配置项目尚未执行最新 `supabase/schema.sql`，不能证明新版 `import_online_book` RPC 参数和原子整本写入已部署。按本批授权边界：

- 未执行远程 schema；
- 未调用 `import_online_book`；
- 未导入《红楼梦》；
- 未产生需要清理的远程书籍、章节或封面。

待维护者执行最新 schema 并确认函数签名后，应使用固定 `(source=wikisource, sourceBookId=7683)` 进行一次整本导入，检查 120 章顺序、第一章正文、`source_attribution` 和重复导入 `alreadyImported=true`，随后按测试项目策略清理。

## 来源与许可归属

自动化测试确认 Wikisource 导入模型保存：

- `source=wikisource`；
- 稳定根 pageid；
- 规范来源 URL；
- `来源：中文维基文库；作品版权与许可状态以来源页标注为准`。

`copyrightStatus=authorized` 表示来源平台按其页面条款提供内容，不代表系统统一判断所有版本或翻译均为公版。具体许可以规范来源页标注为准。

## 全量回归

以下命令全部通过：

```powershell
cd server
npm run typecheck
npm test
npm run build

cd ..\mobile
npx tsx scripts/test-online-books.ts
npx tsc --noEmit
npm run test:scene-placement
npm run test:reader-pagination
npm run test:txt-import -- ..\docs\product-scope.md

cd ..\worker
$env:PYTHONPATH="<worktree>\worker\src"
& "C:\Users\18270\AppData\Local\Programs\Python\Python313\python.exe" -m unittest discover -s tests -v

cd ..
git diff --check
```

结果汇总：

- server：35 个测试通过，typecheck 和 build 通过；
- mobile：多书源定向脚本、typecheck、场景落位、阅读分页和 TXT 导入脚本通过；
- worker：9 个 unittest 通过；
- repository：`git diff --check` 通过。

## 结论与限制

真实只读验收证明《红楼梦》根页面、120 回直接章节、自然顺序和第一回简体可读正文均满足设计前提。自动化测试覆盖聚合部分失败、可信 URL、200 章/20 MiB 限制、原子 RPC 参数、来源归属和 Gutenberg 兼容。

原始验收时整本持久化尚未执行；该限制已由 2026-08-12 的补充验收解除。

## 2026-08-12 Supabase 持久化补充验收

- API 健康检查返回 `dataMode=supabase`。
- 全局插图设置从月限额 100 临时改为 101，重启 Server 后仍读到 101，随后恢复为 100。
- 导入专用私有书源版本，重启 Server 后版本仍存在且保持未启用；删除后按设计保留带 `removedAt` 的软删除历史版本，不参与启用。
- 使用授权中文固定快照中的《大学》执行受控整本导入：首次写入 1 章并返回 `alreadyImported=false`，第二次返回同一书 ID 且 `alreadyImported=true`。
- 将测试书的每书插图开关设为关闭，重启后书籍、章节、来源归属、MIT 归属信息和关闭状态均恢复成功。
- 验证完成后删除《大学》测试书并确认返回 404；用户原有书籍未修改。

本次证明最新 schema 中的插图设置、私有书源版本、书籍来源归属、每书插图开关和原子整本导入已经真实部署并可跨进程重启持久化。

补充验收时发现服务层已支持 `chinese_poetry`，但 `/online-books/import` HTTP 路由仍只放行 `gutenberg` 和 `wikisource`。该遗漏已于 2026-08-13 修复：路由现在放行已注册的 `gutenberg`、`wikisource`、`chinese_poetry` 和 `private_json`，并新增 HTTP 回归测试，未知来源仍返回 `INVALID_ONLINE_BOOK`。
