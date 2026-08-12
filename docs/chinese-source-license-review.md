# 中文书源授权与自动访问核验

日期：2026-08-11

本记录依据 `docs/json-book-source-v1-limitations.md` 的四项准入条件，核验候选中文全文书源。只采用书源自身或其官方托管仓库的页面，不以第三方介绍作为授权依据。

## Chinese Text Project（中国哲学书电子化计划）

结论：**不接入自动搜索或整本导入**。

- 官方 API 页面说明存在 JSON API，但同时明确提示 API 使用受使用限制和其它条款约束：[CTP API](https://ctext.org/tools/api)。
- 官方 FAQ 说明，免费登录用户通过插件只能复制或下载单章；机构订阅用户才能单击下载整本：[CTP FAQ](https://ctext.org/faq)。
- 官方首页明确写明：`the use of automatic download software on this site is strictly prohibited`，自动下载程序会被封禁：[CTP 首页](https://ctext.org/)。
- 官方 `robots.txt` 也对多类自动客户端设置禁止规则，并要求普通爬虫限速：[robots.txt](https://ctext.org/robots.txt)。

因此它不满足“明确允许自动访问”和“允许服务端保存整本全文快照”两项条件。Scene Read 不调用其 API、抓取页面、模拟登录、处理验证码或使用整本下载插件。

## chinese-poetry/chinese-poetry

结论：**可作为首个新增授权中文古典文本源**，初版只接入经过固定目录审核的少量作品。

- 官方 GitHub 仓库将自身描述为结构化中华古诗词数据库，仓库公开提供 JSON 文件和 GitHub HTTPS 下载地址：[仓库](https://github.com/chinese-poetry/chinese-poetry)。
- GitHub 官方仓库元数据显示许可证为 MIT（SPDX `MIT`），并提供仓库内容 API、Git 数据 API和克隆地址：[GitHub REST 仓库资源](https://api.github.com/repos/chinese-poetry/chinese-poetry)。
- 仓库内 MIT 许可证明确允许获取副本、使用、复制、修改、合并、发布、分发及再许可，条件是保留版权和许可声明：[LICENSE](https://github.com/chinese-poetry/chinese-poetry/blob/master/LICENSE)。
- 初版快照固定到提交 `b8594f81a89752241442f2ce267d6f66f96704ee`，不静默跟随 `master`。来源页、提交号、MIT 归属和原始文件 URL 都随导入书籍保存。

满足情况：

| 准入条件 | 结果 |
| --- | --- |
| 官方 API/下载或明确允许自动访问 | 通过：官方 GitHub REST/Raw HTTPS 下载 |
| 允许个人使用 | 通过：MIT 不限制个人使用 |
| 允许保存全文快照 | 通过：MIT 明确允许复制与分发 |
| 可保留 URL、许可证和归属 | 通过：固定提交及 LICENSE 可追溯 |

初版目录仅包含公版古典文本的固定 JSON 文件，不开放任意仓库路径，不把现代版权内容混入搜索结果。下载仍执行 20 MiB、200 章、HTTPS、固定域名和内容结构校验。
