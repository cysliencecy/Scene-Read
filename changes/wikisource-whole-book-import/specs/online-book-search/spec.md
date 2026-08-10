# 在线书库聚合搜索规格

## MODIFIED Requirements

### Requirement: 聚合多个书源

在线书库搜索接口 SHALL 使用同一查询同时搜索中文维基文库和 Gutenberg，并返回统一结构的结果。单个书源失败时，接口 MUST 返回其余可用书源的结果，并附带失败书源代码；只有全部书源失败时才返回 `BOOK_SOURCE_UNAVAILABLE`。

#### Scenario: 两个书源均可用

- **WHEN** 用户搜索一个两个书源都有匹配项的关键词
- **THEN** 返回结果 SHALL 同时包含 `wikisource` 和 `gutenberg` 来源
- **AND** 每项结果 SHALL 包含稳定的 `source`、`sourceBookId`、`title`、`sourceUrl`、`copyrightStatus` 和 `canImport`

#### Scenario: 一个书源暂时不可用

- **WHEN** 中文维基文库请求失败而 Gutenberg 请求成功
- **THEN** 搜索接口 SHALL 返回 Gutenberg 结果
- **AND** 响应 SHALL 标明 `wikisource` 搜索失败

#### Scenario: 所有书源均不可用

- **WHEN** 中文维基文库与 Gutenberg 请求都失败
- **THEN** 搜索接口 SHALL 返回 `BOOK_SOURCE_UNAVAILABLE`

### Requirement: 维基文库结果表示整部作品

系统 SHALL 将维基文库章节子页归并到作品根页面，只把可识别的作品根页面作为在线书籍结果，且同一根作品在一页结果中 MUST 只出现一次。

#### Scenario: 搜索命中章节子页

- **WHEN** MediaWiki 搜索结果包含 `红楼梦/第001回` 和 `红楼梦/第002回`
- **THEN** 聚合结果 SHALL 返回一个根作品 `红楼梦`
- **AND** 不得把两回分别显示为两本书

#### Scenario: 搜索命中作品主页

- **WHEN** MediaWiki 搜索结果直接包含一个主命名空间作品主页
- **THEN** 结果 SHALL 保留该作品标题和规范页面 URL

### Requirement: 移动端显示书源状态

移动端在线搜索结果 MUST 显示每本书的来源标签，并在部分书源失败时以非阻断方式提示用户。

#### Scenario: 聚合结果正常显示

- **WHEN** 搜索结果同时包含两个来源
- **THEN** 每张结果卡 SHALL 显示“中文维基文库”或“Project Gutenberg”

#### Scenario: 部分失败仍可选择书籍

- **WHEN** 响应包含可用结果和一个失败书源
- **THEN** 用户 SHALL 仍可选择并导入可用结果
- **AND** 页面 SHALL 显示失败书源的简短提示
