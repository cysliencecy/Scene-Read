# 中文维基文库整本导入规格

## ADDED Requirements

### Requirement: 发现完整章节集合

系统 SHALL 以维基文库作品根页面为书籍，并发现其主命名空间直接章节子页。章节 MUST 按可解释的自然顺序排列；不得把更深层的辅助页、讨论页、索引页或其他命名空间页面导入为章节。

#### Scenario: 回目使用补零编号

- **WHEN** 作品包含 `第001回`、`第002回`、`第010回`
- **THEN** 章节 SHALL 按 1、2、10 的顺序保存

#### Scenario: 回目未补零

- **WHEN** 作品包含 `第一回`、`第二回`、`第十回`
- **THEN** 章节 SHALL 按中文数字所表达的顺序保存

#### Scenario: 存在辅助子页

- **WHEN** 作品前缀下同时存在章节和 `版本说明`、`校勘记` 或更深层子页
- **THEN** 系统 SHALL 只导入被识别为正文章节的直接子页

### Requirement: 获取简体中文正文

系统 MUST 通过中文维基文库官方 MediaWiki API 获取 `zh-hans` 语言变体，并将提取后的有效正文转换为现有章节段落模型。导航、编辑控件、脚注编号和模板装饰不得作为正文段落保存。

#### Scenario: 原页面为繁体中文

- **WHEN** 章节源内容包含繁体字“紅樓夢”
- **THEN** 保存的简体正文 SHALL 显示“红楼梦”

#### Scenario: 页面含有导航与脚注

- **WHEN** API 返回的页面包含章节导航、编辑链接和参考脚注
- **THEN** 章节 blocks SHALL 只包含可阅读正文段落

#### Scenario: 页面无有效正文

- **WHEN** 所有候选章节解析后都没有可阅读段落
- **THEN** 导入接口 SHALL 返回 `ONLINE_BOOK_HAS_NO_READABLE_TEXT`
- **AND** 不得创建书籍记录

### Requirement: 原子化整本持久化

系统 SHALL 在所有章节发现、下载、解析与限制校验成功后才持久化书籍及章节。任一阶段失败时 MUST 不留下部分书籍、部分章节或无主封面数据。

#### Scenario: 完整导入成功

- **WHEN** 用户选择一个未导入且符合限制的维基文库作品
- **THEN** 系统 SHALL 创建一本 `source=wikisource` 的书籍
- **AND** SHALL 按顺序创建全部有效章节
- **AND** 当前章节 SHALL 指向第一章

#### Scenario: 中途章节请求失败

- **WHEN** 任一批次章节正文无法获取
- **THEN** 导入 SHALL 失败并返回明确书源错误
- **AND** 数据库 SHALL 不包含该作品的部分导入记录

#### Scenario: 重复导入

- **WHEN** 相同 `source` 与 `sourceBookId` 的作品已经存在
- **THEN** 系统 SHALL 返回既有书籍和章节
- **AND** `alreadyImported` SHALL 为 `true`

### Requirement: 《红楼梦》真实验收

系统 SHALL 能从中文维基文库搜索并导入《红楼梦》作为整本导入的真实接口验收样例。

#### Scenario: 搜索并导入《红楼梦》

- **WHEN** 使用简体查询“红楼梦”并选择中文维基文库结果
- **THEN** 搜索结果 SHALL 指向作品根页面
- **AND** 导入结果 SHALL 包含按回目顺序排列的章节
- **AND** 第一回正文 SHALL 为可阅读的简体中文
