---
name: component-style-modularization
description: "Use when splitting, organizing, or extracting frontend CSS/LESS from a large global stylesheet into component-local files such as Component/index.less. Preserve cascade, responsive behavior, shared styles, and import order; works with GitHub Copilot and Codex."
---

# Component Style Modularization

Use this skill when asked to split a global stylesheet, colocate styles with React/Vue components, modularize CSS/LESS, or reduce a large `App.css`, `App.less`, or global stylesheet.

## Goals

- Put styles owned by a component or page beside its source, e.g. `ChatPage/index.tsx` and `ChatPage/index.less`.
- Keep application shell, reset, theme tokens, and genuinely shared styles global.
- Preserve the current rendered appearance, responsive behavior, accessibility states, and cascade.
- Avoid maintaining the same selector in both global and local stylesheets after migration.

## Workflow

1. **Inspect before editing.** Find global stylesheet imports, all component-local stylesheets, component markup, selector usages, repeated selectors, media queries, theme overrides, and all import paths. Check the working tree and do not overwrite unrelated user changes.
2. **Build an ownership map.** Classify selectors as component-owned, shared across pages, application shell/theme, or obsolete. Search JSX/TSX usages before moving or deleting selectors. Treat markdown renderers, modal/lightbox primitives, buttons, and design tokens as shared when multiple features use them.
3. **Choose a safe extraction boundary.** Move one component/page at a time. For repeated selector definitions, preserve their source order and consolidate to the effective final declarations. Split mixed media queries by selector ownership rather than moving the whole block. Do not copy every historical override into the new file.
4. **Create a colocated stylesheet.** Prefer `Component/index.less` for directory components or `FeatureName.less` beside a single-file feature. Keep selectors scoped under a component root where practical (for example `.chat-page .composer`). Continue using the repository's existing CSS/LESS convention; do not introduce CSS Modules or a new preprocessor without a requirement.
5. **Wire imports and preserve cascade.** Import the local stylesheet from its component entry point. Ensure shared/global styles load before the local component styles if the local declarations are intended to override them. If an app-level import is needed to guarantee ordering, make the order explicit and document why. Avoid importing the same local stylesheet from multiple entry points.
6. **Remove migrated rules from the global stylesheet.** Retain only shared/base rules there. Search for the migrated selectors afterward to catch duplicate declarations; verify remaining occurrences are intentional shared styles or necessary legacy variants.
7. **Validate behavior.** Run the project's available typecheck/build/lint. Check style compilation, mobile breakpoints, hover/focus/disabled states, empty/loading states, and pages that share any moved selector. If browser testing is available, compare before/after at desktop and mobile widths.
8. **Summarize the split.** List moved modules, shared rules deliberately kept global, validation performed, and any remaining extraction candidates. Do not claim a full migration if only one component was extracted.

## Repository conventions

- Follow existing naming and import style in the current workspace.
- Never edit styles with shell redirection or generated scripts; use workspace file-edit operations.
- Keep unrelated dirty files untouched.
- For Codex compatibility, keep this standard `SKILL.md` with YAML `name` and `description` frontmatter under `.agents/skills/<skill-name>/`.
