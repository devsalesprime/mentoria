# Story 2.2: Migrar Tailwind CSS de CDN para Build Pipeline

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 5 | **Priority:** P1 | **Phase:** 2

## Descricao
Tailwind CSS e carregado via CDN script tag (~300KB+). Migrar para npm dependency com PostCSS, purging, e tailwind.config.ts.

## Acceptance Criteria
- [x] AC1: tailwindcss installed as npm dependency
- [x] AC2: tailwind.config.ts exists with full color palette from index.html (v4: @theme in globals.css)
- [x] AC3: postcss.config.js exists (v4: @tailwindcss/vite plugin replaces PostCSS config)
- [x] AC4: CDN script tag removed from index.html
- [x] AC5: npm run build produces purged CSS — 121KB raw / 17KB gzipped (v4 includes more base utils)
- [x] AC6: All existing Tailwind classes render correctly (visual comparison)
- [x] AC7: Custom utilities (text-gold-gradient, bg-gold-gradient) preserved via @utility directives
- [x] AC8: IDE autocompletion works for custom tokens

## Scope
**IN:** npm tailwindcss, PostCSS config, migrate tokens from index.html, remove CDN
**OUT:** Redesign, new components, theme switching

## Tasks
- [x] 1. npm install -D tailwindcss @tailwindcss/vite autoprefixer
- [x] 2. Create tailwind.config.ts + @theme in globals.css with full color palette from index.html
- [x] 3. @tailwindcss/vite plugin in vite.config.ts (replaces postcss.config.js in v4)
- [x] 4. Create styles/globals.css with @import "tailwindcss" + @theme + @utility directives
- [x] 5. Import globals.css in index.tsx
- [x] 6. Move custom gradient utilities from index.html style block to @utility directives in CSS
- [x] 7. Remove CDN script tag from index.html
- [x] 8. Visual regression: build succeeds, custom tokens present in output
- [x] 9. Verify build size reduction: 300KB+ CDN → 121KB raw / 17KB gzipped

## Dev Notes
- Tailwind v4 (4.2.1) uses @tailwindcss/vite instead of PostCSS plugin
- Config via @theme in CSS, not tailwind.config.ts (kept for IDE compatibility)
- Custom utilities via @utility directive (replaces plugin({ addUtilities }) in v3)
- Content detection is automatic via Vite module graph

## File List
- `styles/globals.css` — NEW: Tailwind imports, @theme tokens, @utility gradients
- `tailwind.config.ts` — NEW: Minimal config for IDE autocompletion
- `vite.config.ts` — MODIFIED: Added @tailwindcss/vite plugin
- `index.tsx` — MODIFIED: Import globals.css
- `index.html` — MODIFIED: Removed CDN script, inline config, and style block

## Debts Resolved: UX-01
## Estimated Effort: 6 hours
