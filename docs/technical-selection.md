# 技术选型

本文件记录阅境 SceneReader 初版可体验 App 的技术选型。

完整说明来源于根目录的 `scene-reader-technical-selection.md`，后续以本文件作为项目内长期维护版本。

## 总体方案

- 移动端：React Native + Expo Dev Client
- 架构方式：混合执行
- 后端：Node.js / TypeScript API + Python Worker
- 数据与文件：Supabase
- 网上书籍检索导入：云端统一检索和处理，优先公开版权或授权书源

## 移动端

选择 React Native + Expo Dev Client。

理由：

- 一套代码覆盖 iOS 和 Android
- TypeScript 技术栈便于和后端协作
- Expo Dev Client 保留开发效率，同时允许接入必要原生能力
- 适合第一版快速跑通真实 App 体验

移动端负责：

- 书架
- 本地导入入口
- 风格选择
- 阅读页
- 插图占位
- 图片缓存
- 阅读进度
- 任务状态展示

## 执行架构

选择混合执行。

App 本地负责阅读体验和基础文件能力；云端负责 AI 场景识别、生图和结果存储。

原则：

- 不默认一次性上传整本书
- 优先按章节处理
- 用户可以先纯文字阅读
- 插图生成完成后逐步出现在阅读页

## 后端

选择 Node.js / TypeScript API + Python Worker。

Node.js API 负责：

- 用户与鉴权
- 书籍记录
- 章节记录
- 阅读进度
- 任务创建
- 任务状态查询
- 图片结果管理

Python Worker 负责：

- TXT / EPUB 解析
- 章节拆分
- 场景变化识别
- prompt 生成
- 生图任务调用
- 结果回写

## 数据与文件

选择 Supabase。

第一版核心数据对象：

- `users`
- `books`
- `chapters`
- `reading_progress`
- `scene_candidates`
- `scene_images`
- `generation_tasks`

文件存储：

- 原始导入文件
- 章节解析缓存
- 生成图片
- 图片缩略图

## 后续网上书籍导入

后续如支持网上书籍检索，不建议 App 直接抓取书源。

建议由云端统一处理：

- 搜索
- 来源接入
- 格式标准化
- 缓存
- 版权和授权边界

第一阶段只接公开版权或授权书源。
