---
name: soft-ui
description: 生成柔和界面风格 (Soft UI) 的 UI 代码 - 适合消费类应用、社交产品、生活服务类 App。当用户请求柔和界面、圆润风格、消费类 App 时自动应用。
version: 1.0.0
style_type: visual
---

# Soft UI Style

## 适用场景
- 消费类应用
- 社交产品
- 生活服务类 App
- 需要亲和感的界面

## 设计原则

### 色彩系统
```yaml
primary_bg: "#f8fafc"    # 主背景 - slate-50
card_bg: "#ffffff"       # 卡片背景 - 纯白
text_primary: "#1f2937"  # 主文本 - gray-800
accent: "#4f46e5"        # 强调色 - indigo-600
shadow_color: "rgba(156, 163, 175, 0.2)"  # 阴影色调
```

### 核心特征
- **大圆角**: `rounded-2xl`, `rounded-3xl`
- **柔和阴影**: `shadow-lg`, `shadow-xl` 配合透明度
- **低饱和度配色**: 避免高对比度
- **宽松间距**: `gap-6`, `gap-8`
- **悬浮效果**: hover 时轻微上移

### 组件规范

**按钮**
```html
<!-- 主要按钮 - 悬浮上移效果 -->
<button class="font-medium border-0 rounded-2xl bg-indigo-500 text-white px-6 py-3 shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5">
  开始使用
</button>

<!-- 次要按钮 -->
<button class="font-medium border-0 rounded-2xl bg-white text-gray-700 px-6 py-3 shadow-lg shadow-gray-200/50 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5">
  了解更多
</button>
```

**卡片**
```html
<!-- 默认卡片 -->
<div class="bg-white border-0 rounded-3xl shadow-xl shadow-gray-200/50 p-6 md:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-gray-200/60">
  内容
</div>

<!-- 柔和背景卡片 -->
<div class="bg-slate-50 rounded-3xl shadow-xl shadow-gray-200/50 p-6 md:p-8">
  内容
</div>

<!-- 彩色主题卡片 -->
<div class="bg-indigo-50 border-0 rounded-3xl shadow-xl shadow-indigo-100/50 p-6 md:p-8">
  内容
</div>
```

**输入框**
```html
<input class="w-full bg-gray-50 border-0 rounded-2xl text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all duration-200 px-4 py-3 shadow-sm" placeholder="请输入...">
```

### 排版规范
```css
/* Hero 标题 */
.text-4xl md:text-5xl lg:text-6xl font-semibold

/* H1 */
.text-3xl md:text-4xl font-semibold

/* 正文 */
.text-sm md:text-base font-normal text-gray-600
```

### 间距规范
```css
/* 区块间距 */
.py-16 md:py-24

/* 容器内边距 */
.px-4 md:px-6 lg:px-8

/* 卡片内边距 */
.p-6 md:p-8

/* 卡片间距 */
.gap-6 md:gap-8
```

## 禁止使用
- `rounded-none`, `rounded-sm` - 禁止尖锐边角
- `border-2`, `border-4` - 禁止硬边框
- `border-black` - 禁止纯黑边框
- `shadow-[` - 禁止自定义硬阴影
- `bg-black` - 禁止纯黑背景
- 高饱和度纯色 - 使用低饱和度配色

## 推荐做法
- 所有主要元素使用 `rounded-2xl` 或 `rounded-3xl`
- 阴影使用带透明度的版本：`shadow-lg shadow-gray-200/50`
- 背景使用浅色调：`bg-slate-50`, `bg-gray-50`
- 按钮悬浮时使用 `hover:-translate-y-0.5`
- 卡片间距使用宽松的 `gap-6` 或 `gap-8`
- 图标使用圆形背景：`rounded-full bg-indigo-100`
- 避免过于紧凑的布局

## 布局原型
- `landing-hero-centered`: 居中标题 + 副标题 + CTA
- `landing-hero-split`: 左侧文字 + 右侧视觉
- `landing-hero-fullscreen`: 全屏背景图
- `landing-saas-pricing`: SaaS 定价页
