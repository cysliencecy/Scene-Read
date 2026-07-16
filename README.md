# 阅境 SceneReader

阅境是一款面向手机端的视觉辅助阅读 App。它允许用户导入 TXT / EPUB 书籍，在阅读时通过 AI 识别章节中的地点或环境变化，并在合适位置生成小型场景插图，帮助读者保持场景感和阅读连续性。

## 当前阶段

项目处于初版可体验 App 的准备阶段。

已完成：

- 产品初步 PRD
- 原型决策备忘录
- 手机 App 高保真界面稿
- 技术选型文档

下一步：

- 创建 React Native + Expo Dev Client 项目骨架
- 用 mock 数据实现核心 App 页面
- 跑通书架、导入、风格选择、阅读页、插图占位状态

## 推荐技术栈

- 移动端：React Native + Expo Dev Client
- 后端 API：Node.js / TypeScript
- AI Worker：Python
- 数据与文件：Supabase Postgres + Supabase Storage
- 架构方式：App 本地阅读体验 + 云端 AI 场景识别和生图

详情见 [docs/technical-selection.md](docs/technical-selection.md)。

## 主要文档

- [docs/product-scope.md](docs/product-scope.md)：第一版产品范围
- [docs/technical-selection.md](docs/technical-selection.md)：技术选型
- [docs/roadmap.md](docs/roadmap.md)：阶段路线图
- [docs/decisions.md](docs/decisions.md)：关键决策记录

## Codex 协作方式

建议每次只推进一个阶段，例如：

```text
按照 docs/product-scope.md 和 docs/technical-selection.md，先创建 React Native + Expo Dev Client 项目骨架。
第一阶段只实现 App UI，使用 mock 数据，不接后端。
完成后运行并告诉我怎么预览。
```

不要一次性要求完成整个产品。优先让每个阶段都有可运行、可查看、可验证的结果。
