---
name: project-directory-spec
description: 规定前端项目（React/Vue/Vite/Next.js 等）的文件与目录结构规范，当 AI 需要创建新组件、页面、API、状态管理或工具函数时必须触发并遵守。
---

# 前端项目目录规范 (Project Directory Specification)

## 1. 适用场景 (When to use)
- 当用户要求**创建新页面、新组件、新 API、新 Hooks 或工具类**时。
- 当 AI 需要初始化或重构前端项目结构时。

## 2. 核心目录结构标准 (Directory Structure)

本项目采用以下标准目录划分：

```text
src/
├── assets/          # 静态资源（图片、全局样式、字体等）
├── components/      # 公共通用组件（跨业务、高度复用）
│   ├── Button/
│   │   ├── index.tsx
│   │   ├── style.less
│   │   └── types.ts
│   └── ...
├── config/          # 全局配置文件（常量、环境配置、路由白名单等）
├── hooks/           # 全局自定义 React/Vue Hooks (useXxx)
├── layouts/         # 页面布局组件（BasicLayout, BlankLayout 等）
├── pages/ 或 views/ # 页面级路由组件（按业务模块划分）
│   ├── Dashboard/
│   │   ├── components/  # 仅该页面使用的私有子组件
│   │   ├── hooks/       # 仅该页面使用的私有 Hooks
│   │   ├── index.tsx    # 页面入口
│   │   └── style.less
│   └── ...
├── router/          # 路由配置
├── services/ 或 api/ # 网络请求与接口定义层（按模块划分，如 user.ts, order.ts）
├── store/ 或 state/ # 全局状态管理 (Zustand / Redux / Pinia)
├── types/           # 全局 TypeScript 类型定义 (.d.ts 或 index.ts)
├── utils/           # 通用纯函数工具库（format.ts, request.ts 等）
└── App.tsx          # 根组件
```

## 3. 严格规则与边界 (Do / Ask / Never)

### 必须做 (DO)
1. **组件目录命名强制要求**：每个组件都必须遵循“组件名目录 + index 文件 + 同名样式文件”的组织方式，示例：
   ```text
   src/components/chat/ToolCallBlock/
   ├── index.tsx
   ├── index.less
   └── index.test.tsx   # 需要时可选
   ```
   以及：
   ```text
   src/pages/ChatPage/
   ├── index.tsx
   ├── index.less
   └── components/
       └── SomeChild/
           ├── index.tsx
           └── index.less
   ```
2. **就近原则 (Colocation)**：如果一个子组件、Hooks 或类型**只**属于某一个页面（Page），必须放在该页面目录下的 `components/` 或 `hooks/` 中，**严禁**直接丢到全局 `src/components` 或 `src/hooks` 里。
3. **命名规范**：
   - 文件夹统一使用 **kebab-case**（如 `user-profile/`）或 **PascalCase**（组件目录视团队习惯，推荐和组件名一致如 `UserProfile/`）。
   - 组件入口文件统一命名为 `index.tsx`（React）或 `index.vue`（Vue）。
   - 样式文件统一命名为 `index.less` / `index.css` / `style.less`，但在本项目中优先使用 `index.less` 与组件目录同名。
4. **分层清晰**：
   - `services/` 中只写请求逻辑和数据转换，不写复杂 UI 逻辑。
   - `utils/` 中必须是无副作用的纯函数（Pure Functions）。

### 遇到不确定时必须询问 (ASK)
- 当新增一个模块，分不清它是属于“全局通用组件”还是“某个页面的私有组件”时，**必须先向用户确认**再创建文件。

### 绝对禁止 (NEVER)
- ❌ **禁止**在 `src/` 根目录下随意平铺孤立的文件（如直接在 `src/` 下面建 `helper2.js`、`temp.ts`）。
- ❌ **禁止**继续使用 `Component.tsx + Component.css` 这种散列文件命名方式；所有组件必须用目录形式组织，如 `Component/index.tsx` + `Component/index.less`。
- ❌ **禁止**跨层级直接混用业务逻辑与 UI（例如在公共组件里直接硬编码调用特定的业务 API）。

## 4. 输出示例 (Output Example)
当被要求“建一个用户个人中心页面”时，AI 应该生成的目录树：
```text
src/pages/UserProfile/
├── components/
│   └── AvatarEditor/
│       ├── index.tsx
│       └── index.less
├── hooks/
│   └── useUserProfile.ts
├── index.tsx
├── index.less
└── types.ts
```

如果被要求“创建一个 ToolCallBlock 组件”，AI 必须生成：
```text
src/components/chat/ToolCallBlock/
├── index.tsx
├── index.less
└── types.ts   # 需要时
```
