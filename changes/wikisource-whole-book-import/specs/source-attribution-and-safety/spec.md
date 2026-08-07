# 书源归属与导入安全规格

## ADDED Requirements

### Requirement: 保存来源与许可归属

维基文库导入的书籍 MUST 保存 `source=wikisource`、稳定页面标识、规范来源 URL 和许可归属。移动端 SHALL 能从书籍数据识别该来源，且不得把维基文库内容标记为 Gutenberg 内容。

#### Scenario: 保存维基文库作品

- **WHEN** 一部维基文库作品导入成功
- **THEN** 书籍记录 SHALL 保存维基文库页面标识和规范 URL
- **AND** SHALL 保存适用的 Wikimedia/Wikisource 许可归属文本

#### Scenario: 读取既有 Gutenberg 书籍

- **WHEN** 系统读取现有 `source=gutenberg` 记录
- **THEN** 其类型、来源 URL 和导入行为 SHALL 保持兼容

### Requirement: 限制导入规模

系统 MUST 拒绝章节数超过 200 或累计 UTF-8 正文字节数超过 20 MB 的维基文库作品，并在持久化前完成限制判断。

#### Scenario: 章节数超限

- **WHEN** 作品发现 201 个有效章节
- **THEN** 导入接口 SHALL 返回 `ONLINE_BOOK_TOO_MANY_CHAPTERS`
- **AND** 不得创建书籍记录

#### Scenario: 正文大小超限

- **WHEN** 解析后的累计 UTF-8 正文字节数超过 20 MB
- **THEN** 导入接口 SHALL 返回 `BOOK_DOWNLOAD_TOO_LARGE`
- **AND** 不得创建书籍记录

#### Scenario: 作品处于限制以内

- **WHEN** 作品不超过 200 章且正文不超过 20 MB
- **THEN** 系统 SHALL 继续执行完整持久化

### Requirement: 限制外部请求目标

系统 MUST 只向配置的中文维基文库 HTTPS API 域名请求搜索和正文，不得跟随到非 Wikimedia 受信域名获取正文。

#### Scenario: API 返回外部链接

- **WHEN** 页面正文或元数据包含第三方 URL
- **THEN** 导入流程 SHALL 不请求该第三方 URL

#### Scenario: 配置使用非 HTTPS 地址

- **WHEN** 维基文库 API 基础地址不是 HTTPS
- **THEN** 服务启动或首次调用 SHALL 拒绝该配置

