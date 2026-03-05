# Story 2.6: Consolidar Design Tokens e Corrigir Configs

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 5 | **Priority:** P2 | **Phase:** 2
**Depends on:** Story 2.2 (Tailwind build pipeline)

## Descricao
6+ diferentes hex values para backgrounds escuros, base path mismatch, import map leftover, DOMPurify+marked duplicados.

## Acceptance Criteria
- [x] AC1: All dark background colors use named tokens (no raw hex)
- [x] AC2: New token prosperus-navy-mid defined in globals.css @theme (Tailwind v4)
- [x] AC3: Base path aligned between vite.config.ts and index.html
- [x] AC4: Import map removed from index.html
- [x] AC5: Single renderMarkdown utility in utils/markdown.ts
- [x] AC6: assets/shared.tsx re-exports renderMarkdown from utils/markdown.ts
- [x] AC7: 262 bg-[# occurrences replaced across 36 files

## Scope
**IN:** Token consolidation, config fixes, markdown util extraction
**OUT:** Full design system, theme switching, new colors

## Tasks
- [x] 1. Add prosperus-navy-mid, prosperus-gold-hover, prosperus-navy-panel, whatsapp tokens to globals.css @theme
- [x] 2. Replace all raw hex dark backgrounds with named tokens (262 replacements across 36 files)
- [x] 3. Remove mismatched base path from index.html
- [x] 4. Remove import map block from index.html
- [x] 5. Create utils/markdown.ts with consolidated renderMarkdown + sanitizeHtml
- [x] 6. Update assets/shared.tsx to re-export renderMarkdown from utils/markdown.ts
- [x] 7. Verify build passes (125KB CSS raw / 17.56KB gzipped)

## File List
- `styles/globals.css` — Added 4 new tokens to @theme, body uses CSS variables
- `utils/markdown.ts` — NEW: Consolidated renderMarkdown + sanitizeHtml
- `components/assets/shared.tsx` — Re-exports renderMarkdown from utils/markdown.ts
- `index.html` — Removed `<base>` tag and importmap block
- 36 component files — 262 bg-[#hex] → named token replacements

## Debts Resolved: UX-09, BUILD-01, BUILD-02, BUILD-04
## Estimated Effort: 10 hours
