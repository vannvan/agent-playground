---
name: neumorphism
version: 1.0.0
description: Neumorphism design style for web interfaces
keywords: [立体感, 双重阴影, 柔和, 浅色系, 内凹外凸]
author: StyleKit
style_type: visual
---

# Neumorphism Style

## Overview
柔和的内凹外凸立体效果，通过双重阴影模拟光源，浅色背景配同色系元素，营造精致的立体感。

## Philosophy
Neumorphism（新拟物派）是一种介于扁平设计和拟物设计之间的风格，通过柔和的阴影创造出元素从背景中"挤压"或"凹陷"的视觉效果。

## Design Tokens

### Border
- Width: `border-0`
- Color: `border-transparent`
- Radius: `rounded-xl`

### Shadow
- Small: `shadow-[4px_4px_8px_#b8bcc2,-4px_-4px_8px_#ffffff]`
- Medium: `shadow-[6px_6px_12px_#b8bcc2,-6px_-6px_12px_#ffffff] md:shadow-[8px_8px_16px_#b8bcc2,-8px_-8px_16px_#ffffff]`
- Large: `shadow-[8px_8px_16px_#b8bcc2,-8px_-8px_16px_#ffffff] md:shadow-[12px_12px_24px_#b8bcc2,-12px_-12px_24px_#ffffff]`
- Hover: `hover:shadow-[4px_4px_8px_#b8bcc2,-4px_-4px_8px_#ffffff]`

### Typography
- Heading: `font-semibold text-gray-800`
- Body: `text-gray-600`
- Hero: `text-4xl md:text-6xl`
- H1: `text-3xl md:text-4xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20`
- Container: `px-6 md:px-8`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-[#e0e5ec]`
- Secondary BG: `bg-[#f0f0f3]`
- Primary Text: `text-gray-800`
- Primary Button: `bg-[#6d5dfc] text-white`

## Component Recipes

### Button
- Base: `font-semibold bg-[#e0e5ec] text-gray-700 rounded-xl border-none transition-all duration-200`
- Primary: `shadow-[5px_5px_10px_#b8bec7,-5px_-5px_10px_#ffffff]`
- Pressed: `shadow-[inset_5px_5px_10px_#b8bec7,inset_-5px_-5px_10px_#ffffff]`
- Accent: `bg-[#6d5dfc] text-white shadow-[5px_5px_10px_#b8bec7,-5px_-5px_10px_#ffffff]`
- Flat: ``

- Hover: `hover:shadow-[3px_3px_6px_#b8bec7,-3px_-3px_6px_#ffffff]`

### Card
- Base: `bg-[#e0e5ec] rounded-2xl border-none transition-all duration-300`
- Default: `shadow-[8px_8px_16px_#b8bec7,-8px_-8px_16px_#ffffff]`
- Inset: `shadow-[inset_8px_8px_16px_#b8bec7,inset_-8px_-8px_16px_#ffffff]`
- Flat: ``

- Hover: `hover:shadow-[10px_10px_20px_#b8bec7,-10px_-10px_20px_#ffffff]`

### Input
- Base: `w-full bg-[#e0e5ec] rounded-xl border-none text-gray-700 focus:outline-none transition-all duration-200`
- Default: `shadow-[inset_5px_5px_10px_#b8bec7,inset_-5px_-5px_10px_#ffffff]`
- Raised: `shadow-[5px_5px_10px_#b8bec7,-5px_-5px_10px_#ffffff]`

### Heading
- Base: `font-bold tracking-tight leading-tight text-gray-700`
- Default: `text-gray-700`
- Accent: `text-[#6d5dfc]`
- Muted: `text-gray-400`

### Badge
- Base: `inline-block font-semibold text-xs md:text-sm bg-[#e0e5ec] text-gray-700 rounded-lg`
- Default: `shadow-[3px_3px_6px_#b8bec7,-3px_-3px_6px_#ffffff]`
- Inset: `shadow-[inset_3px_3px_6px_#b8bec7,inset_-3px_-3px_6px_#ffffff]`
- Accent: `bg-[#6d5dfc] text-white shadow-[3px_3px_6px_#b8bec7,-3px_-3px_6px_#ffffff]`

### Navigation
- Base: `bg-[#e0e5ec] px-4 md:px-8 py-3 md:py-4`
- Default: `shadow-[0_4px_8px_#b8bec7,0_-2px_4px_#ffffff]`
- Flat: ``

## Forbidden Patterns
These classes must NEVER be used in Neumorphism style:

- `rounded-none`
- `rounded-sm`
- `shadow-sm`
- `shadow`
- `shadow-md`
- `shadow-lg`
- `shadow-xl`
- `shadow-2xl`
- `bg-black`
- `bg-white`

- Pattern: `^rounded-none`
- Pattern: `^shadow-(?!\[|none)`
- Pattern: `^bg-gradient-`
- Pattern: `^border-[248]`
- Pattern: `^bg-black`

### Why:
- `rounded-none`: Neumorphism requires rounded corners (rounded-xl or rounded-2xl)
- `shadow-lg`: Neumorphism uses dual-shadow system, not standard shadows
- `bg-white`: Neumorphism uses light gray backgrounds (#e0e5ec), not pure white

## Do's
- 使用浅色背景 bg-[#e0e5ec] 或 bg-[#f0f0f3]
- 使用双重阴影 shadow-[8px_8px_16px_#b8bcc2,-8px_-8px_16px_#ffffff]
- 凹陷效果使用 inset 阴影 shadow-[inset_8px_8px_16px_#b8bcc2,inset_-8px_-8px_16px_#ffffff]
- 使用中等圆角 rounded-xl (12-24px)
- 交互元素按下时从凸起变凹陷
- 保持元素与背景同色系
- 响应式阴影大小 md: 前缀增大
- 按钮 hover 时减小外阴影（Hover Shadowing，手指靠近遮光效果）：从 shadow-[8px_8px_16px...] 减至 shadow-[4px_4px_8px...]
- 按钮 active 必须从外凸转为内凹（Extrude to Intrude）：active:shadow-[inset_4px_4px_8px_#b8bcc2,inset_-4px_-4px_8px_#ffffff]，禁止使用 translate 位移
- 所有过渡使用 duration-300 ease-in-out（Smooth Molding，软塑料柔韧性）
- 输入框 focus 时减小内阴影深度（惰性收缩，非增强）：从 inset 6px 减至 inset 2px，暗示输入通道打开
- 光源方向始终固定为左上亮、右下暗（Fixed Illuminant）：负 X/Y 偏移 = 白色高光，正 X/Y 偏移 = 暗色阴影

## Don'ts
- 禁止使用纯黑或纯白背景
- 禁止使用高对比度配色
- 禁止使用粗边框 border-2 及以上
- 禁止使用渐变背景 bg-gradient-*
- 禁止直角 rounded-none
- 禁止按钮使用任何 translate 位移（新拟物元素是长在背景上的，不可浮起）
- 禁止 hover 时增大阴影（与光影物理规律相悖，手指靠近应使阴影缩小）
- 禁止打破光源方向（亮阴影必须在左上 -X/-Y，暗阴影必须在右下 +X/+Y）
- 禁止输入框 focus 时增大内阴影（应减小，模拟通道开放而非加压）

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA. Clean and focused.
- `landing-hero-split`: Text on left, image/visual on right. Great for product showcases.
- `landing-hero-fullscreen`: Full viewport hero with background image or color. High impact.
- `landing-video-hero`: Full-screen video background with overlay text. High impact for product demos.
- `landing-saas-pricing`: Complete SaaS pricing page with hero, pricing tiers, FAQ, and CTA.
- `landing-waitlist`: Minimal pre-launch page with email collection and countdown.

## Example Usage

```
Generate a landing page with:
- Style: neumorphism
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "智能家居控制面板"
- "计算器应用"
- "音频控制器"

---
Generated by StyleKit · https://www.stylekit.top
Style: 新拟物派 (Neumorphism)