---
name: neumorphism
description: 生成新拟物派风格 (Neumorphism) 的 UI 代码 - 适合智能家居、计算器、音频控制器等需要精致立体感的界面。当用户请求新拟物、立体UI、凸起凹陷效果时自动应用。
version: 1.0.0
style_type: visual
---

# Neumorphism Style

## 适用场景
- 智能家居控制面板
- 计算器应用
- 音频控制器
- 需要精致立体感的界面

## 设计原则

### 核心概念
新拟物派通过双重阴影模拟光源，创建元素从背景中"挤压"或"凹陷"的视觉效果。

**光源方向**: 左上亮 (-X/-Y)，右下暗 (+X/+Y)

### 色彩系统
```yaml
primary_bg: "#e0e5ec"     # 主背景 - 浅灰蓝
secondary_bg: "#f0f0f3"   # 次要背景
text_primary: "#2d3748"   # 主文本 - 深灰
text_secondary: "#718096" # 次要文本 - 中灰
accent: "#6d5dfc"         # 强调色 - 紫色
```

### 阴影公式

**外凸阴影** (默认状态)
```css
box-shadow: 8px 8px 16px #b8bec7, -8px -8px 16px #ffffff;
```

**内凹阴影** (凹陷/按下状态)
```css
box-shadow: inset 8px 8px 16px #b8bec7, inset -8px -8px 16px #ffffff;
```

**小尺寸**
```css
box-shadow: 4px 4px 8px #b8bcc2, -4px -4px 8px #ffffff;
```

**中尺寸**
```css
box-shadow: 6px 6px 12px #b8bcc2, -6px -6px 12px #ffffff;
```

### 组件规范

**按钮**
```html
<!-- 默认按钮 - 外凸效果 -->
<button class="font-semibold bg-[#e0e5ec] text-gray-700 rounded-xl border-none shadow-[5px_5px_10px_#b8bec7,-5px_-5px_10px_#ffffff] transition-all duration-300 ease-in-out hover:shadow-[3px_3px_6px_#b8bec7,-3px_-3px_6px_#ffffff] active:shadow-[inset_4px_4px_8px_#b8bec7,inset_-4px_-4px_8px_#ffffff] px-6 py-3">
  按钮
</button>

<!-- 强调色按钮 -->
<button class="font-semibold bg-[#6d5dfc] text-white rounded-xl border-none shadow-[5px_5px_10px_#b8bec7,-5px_-5px_10px_#ffffff] transition-all duration-300 ease-in-out hover:shadow-[3px_3px_6px_#b8bec7,-3px_-3px_6px_#ffffff] active:shadow-[inset_4px_4px_8px_#b8bec7,inset_-4px_-4px_8px_#ffffff] px-6 py-3">
  确认
</button>
```

**卡片**
```html
<!-- 默认卡片 - 外凸 -->
<div class="bg-[#e0e5ec] rounded-2xl border-none shadow-[8px_8px_16px_#b8bec7,-8px_-8px_16px_#ffffff] p-6 transition-all duration-300 ease-in-out hover:shadow-[10px_10px_20px_#b8bec7,-10px_-10px_20px_#b8bec7]">
  内容
</div>

<!-- 凹陷卡片 -->
<div class="bg-[#e0e5ec] rounded-2xl border-none shadow-[inset_8px_8px_16px_#b8bec7,inset_-8px_-8px_16px_#ffffff] p-6">
  内容
</div>
```

**输入框**
```html
<!-- 凹陷输入框 - 默认 -->
<input class="w-full bg-[#e0e5ec] rounded-xl border-none text-gray-700 placeholder:text-gray-400 focus:outline-none shadow-[inset_5px_5px_10px_#b8bec7,inset_-5px_-5px_10px_#ffffff] transition-all duration-300 ease-in-out focus:shadow-[inset_2px_2px_4px_#b8bec7,inset_-2px_-2px_4px_#ffffff] px-4 py-3">

<!-- 凸起输入框 -->
<input class="w-full bg-[#e0e5ec] rounded-xl border-none text-gray-700 placeholder:text-gray-400 focus:outline-none shadow-[5px_5px_10px_#b8bec7,-5px_-5px_10px_#ffffff] transition-all duration-300 ease-in-out focus:shadow-[inset_2px_2px_4px_#b8bec7,inset_-2px_-2px_4px_#ffffff] px-4 py-3">
```

**徽标/Badge**
```html
<!-- 外凸徽标 -->
<span class="inline-block font-semibold text-xs bg-[#e0e5ec] text-gray-700 rounded-lg shadow-[3px_3px_6px_#b8bec7,-3px_-3px_6px_#ffffff] px-2 py-1">
  新
</span>

<!-- 内凹徽标 -->
<span class="inline-block font-semibold text-xs bg-[#e0e5ec] text-gray-700 rounded-lg shadow-[inset_3px_3px_6px_#b8bec7,inset_-3px_-3px_6px_#ffffff] px-2 py-1">
  徽章
</span>
```

### 交互状态转换

**按钮按下**: 外凸 → 内凹
```html
active:shadow-[inset_4px_4px_8px_#b8bec7,inset_-4px_-4px_8px_#ffffff]
```

**输入框聚焦**: 减小内阴影深度
```css
/* 默认 */
shadow-[inset_5px_5px_10px_#b8bec7,inset_-5px_-5px_10px_#ffffff]
/* Focus */
focus:shadow-[inset_2px_2px_4px_#b8bec7,inset_-2px_-2px_4px_#ffffff]
```

**按钮 Hover**: 减小外阴影（模拟手指靠近遮挡光线）
```css
/* 默认 */
shadow-[5px_5px_10px_#b8bec7,-5px_-5px_10px_#ffffff]
/* Hover */
hover:shadow-[3px_3px_6px_#b8bec7,-3px_-3px_6px_#ffffff]
```

## 禁止使用
- `rounded-none`, `rounded-sm` - 必须使用圆角
- `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl` - 禁止标准阴影
- `bg-black`, `bg-white` - 禁止纯黑纯白背景
- `bg-gradient-*` - 禁止渐变背景
- `translate-y-*`, `translate-x-*` - 禁止位移效果
- `border-2`, `border-4` - 禁止粗边框

## 关键规则

1. **光源方向固定**: 左上亮（白色高光），右下暗（灰色阴影）
2. **元素长在背景上**: 禁止使用 translate 位移
3. **Hover 减小阴影**: 手指靠近应使阴影缩小
4. **Active 转为内凹**: 按下时必须从外凸变内凹
5. **过渡效果**: 使用 `duration-300 ease-in-out`
6. **Input Focus**: 减小内阴影深度，暗示通道打开

## Tailwind 配置建议

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        neumorph: {
          bg: '#e0e5ec',
          highlight: '#ffffff',
          shadow: '#b8bec7',
        }
      },
      boxShadow: {
        'neu': '8px 8px 16px #b8bec7, -8px -8px 16px #ffffff',
        'neu-sm': '4px 4px 8px #b8bcc2, -4px -4px 8px #ffffff',
        'neu-lg': '12px 12px 24px #b8bec7, -12px -12px 24px #ffffff',
        'neu-inset': 'inset 8px 8px 16px #b8bec7, inset -8px -8px 16px #ffffff',
        'neu-inset-sm': 'inset 4px 4px 8px #b8bec7, inset -4px -4px 8px #ffffff',
      }
    }
  }
}
```
