# 毕业搭子局

毕业旅行多人共识助手原型：私下填写偏好 → 三套可解释共识方案 → 每日行程 → AA 费用分摊（含成员退出重算）。

技术栈：React 18 + Vite 6 + TypeScript + Tailwind CSS v4 + lucide-react，数据为本地模拟数据 + localStorage。

## 笔试展示功能
- 首次访问三步引导（独立 key `biye-dazi-ju:onboarding-seen`，重置演示数据不会清除）
- 提交/修改偏好后弹出“你的加入改变了结果”，前后数据均由 `computeStats` 实时计算
- 共识区“匹配度如何计算？”：权重来自 `src/logic.ts` 的 `MATCH_WEIGHTS`（40/20/20/10/10）
- “体验完整流程”演示面板：预填偏好、比较方案、锁定成都、模拟退出、重置

## 本地运行
```bash
npm install
npm run dev      # 开发
npm run build    # 生产构建，输出 dist/
npm run preview  # 预览构建产物
```

## 部署到 Vercel
1. 推送到 GitHub，在 Vercel 中 Import 该仓库（Framework 自动识别为 Vite，输出目录 dist）。
2. 或使用 CLI：`npm i -g vercel && vercel` 首次关联项目，之后 `vercel --prod` 发布生产版本。

## 保持生产域名不变
始终部署到同一个 Vercel 项目：Git 方式下每次 push 到 main 自动更新生产域名（xxx.vercel.app）；CLI 方式保留 `.vercel/` 目录并使用 `vercel --prod`。不要删除项目或重新新建项目。
