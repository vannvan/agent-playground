---
name: dashboard-layout
description: 生成仪表盘布局风格的 UI 代码 - 适合后台管理系统、数据分析平台、监控面板。当用户请求仪表盘、数据面板、后台管理界面时自动应用。
version: 1.0.0
style_type: layout
---

# Dashboard Layout Style

## 适用场景
- 后台管理系统
- 数据分析平台
- 监控面板
- KPI 数据展示

## 设计原则

### 色彩系统
```yaml
primary_bg: "#f9fafb"      # 主背景 - 浅灰
card_bg: "#ffffff"         # 卡片背景 - 纯白
text_primary: "#111827"    # 主文本 - 深灰
accent: "#6366f1"          # 强调色 - indigo
border: "#e5e7eb"          # 边框 - 浅灰
success: "#10b981"         # 增长 - 绿色
danger: "#ef4444"          # 下降 - 红色
```

### 组件规范

**按钮**
```html
<!-- 主要按钮 -->
<button class="font-medium rounded-lg bg-[#6366f1] text-white px-4 py-2 transition-colors duration-200 hover:bg-[#4f46e5]">
  操作
</button>

<!-- 次要按钮 -->
<button class="font-medium rounded-lg bg-gray-100 text-[#111827] px-4 py-2 transition-colors duration-200 hover:bg-gray-200">
  取消
</button>
```

**卡片**
```html
<!-- 默认卡片 -->
<div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-6 transition-shadow duration-200 hover:shadow-md">
  内容
</div>

<!-- KPI 卡片（带左侧边框） -->
<div class="bg-white rounded-xl border border-gray-100 shadow-sm border-l-4 border-l-[#6366f1] p-4 md:p-6">
  <div class="text-2xl font-semibold text-[#111827]">12,345</div>
  <div class="text-sm text-gray-500 mt-1">总收入</div>
</div>
```

**输入框**
```html
<input class="w-full bg-gray-50 border border-gray-200 rounded-lg text-sm text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1] transition-all duration-200 px-3 py-2" placeholder="请输入...">
```

### 布局模式

**侧边导航 + 顶部工具栏**
```css
/* 侧边栏 */
aside {
  background: #111827; /* bg-gray-900 */
  width: 16rem;        /* w-64 */
}

/* 内容区 */
main {
  background: #f9fafb; /* bg-[#f9fafb] */
}
```

**数据网格**
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <!-- 4列 KPI 卡片 -->
</div>
```

**图表区域**
```html
<div class="bg-white rounded-xl border border-gray-100 shadow-sm aspect-video p-4">
  <!-- 图表容器 -->
</div>
```

## 禁止使用
- `rounded-none` - 必须使用圆角
- `shadow-2xl` - 阴影过重
- `font-black`, `font-extrabold` - 字体过粗
- `text-5xl` 及以上 - 字号过大
- `rounded-3xl`, `rounded-full` - 过度圆角

## 推荐做法
- 深色侧边栏 + 浅色内容区
- 顶部包含搜索、通知、用户头像
- 使用 CSS Grid 排列数据面板
- KPI 卡片使用大字号数字
- 图表使用适当比例（aspect-video/aspect-square）
- 数据状态用颜色区分（绿增红减）
- 保持一致的间距和面板尺寸
