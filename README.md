# 阅境 SceneReader

阅境是一款面向手机端的视觉辅助阅读 App。它允许用户导入 TXT / EPUB 书籍，在阅读时通过 AI 识别章节中的地点或环境变化，并在合适位置生成小型场景插图，帮助读者保持场景感和阅读连续性。

## 当前阶段

项目处于初版可体验 App 的准备阶段。

已完成：

- 产品初步 PRD
- 原型决策备忘录
- 手机 App 高保真界面稿
- 技术选型文档
- React Native + Expo Dev Client App 骨架

下一步：

- 稳定 React Native + Expo Dev Client 项目骨架
- 用 mock 数据继续完善核心 App 页面
- 按 `docs/task-line.md` 分批推进后续 coding

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
- [docs/task-line.md](docs/task-line.md)：后续 coding 任务线

## 本地运行

移动端 App 位于 `mobile/` 目录。

推荐 Node 版本：

- Node.js `22.13.0` 或更新的 Node 22 LTS

当前项目可以在 Node `23.0.0` 下运行类型校验和 Expo Web 预览，但 React Native `0.86.0` 会提示 Node 版本不在推荐范围内。正式持续开发建议切到 Node 22 LTS，减少 Metro 和依赖兼容风险。

安装依赖：

```powershell
cd "F:\codexDemo\Scene Read\mobile"
npm install
```

类型校验：

```powershell
cd "F:\codexDemo\Scene Read\mobile"
npx tsc --noEmit
```

启动 Web 预览：

```powershell
cd "F:\codexDemo\Scene Read\mobile"
npx expo start --web --port 8081
```

浏览器打开：

```text
http://localhost:8081
```

移动端预览：

- Web：运行 `npx expo start --web --port 8081`
- iOS / Android 真机：先在 `mobile/.env.local` 配置 `EXPO_PUBLIC_API_BASE_URL=http://你的电脑局域网IP:4000`，再运行 `npx expo start --lan`
- 详细步骤见 [mobile/README.md](mobile/README.md)

## Codex 协作方式

建议每次只推进一个阶段，例如：

```text
按照 docs/task-line.md，开始执行 T1。
只做本批任务，不提前做后续批次。
完成后运行验证并汇报改了什么。
```

不要一次性要求完成整个产品。优先让每个阶段都有可运行、可查看、可验证的结果。
