# Story DS-2.2: Extender Button Component

**Epic:** EPIC-DS-001 | **Status:** Done | **Points:** 8 | **Priority:** P1 | **Phase:** 2
**Depends on:** Story DS-1.1

## Descricao
O Button component existente tem apenas 2 variantes (primary, outline) e tamanho fixo (py-4 px-8). Apenas 3 de 217 instancias de botao no codebase usam o componente (1.4% adocao). A auditoria identificou 56 combinacoes de classe unicas que podem ser consolidadas em 9 variantes + 5 tamanhos + suporte a icone.

## Acceptance Criteria
- [x] AC1: Button component extendido com 9 variantes: primary, secondary, danger, danger-soft, success, ghost, icon, outline, link
- [x] AC2: 5 tamanhos implementados: xs (px-2 py-1), sm (px-3 py-1.5), md (px-3.5 py-2), lg (px-5 py-2.5), xl (px-6 py-3)
- [x] AC3: Children-based icon support via gap-2 inline-flex layout
- [x] AC4: Estado loading com spinner SVG integrado
- [x] AC5: Estilo disabled correto (opacity-50 + cursor-not-allowed + pointer-events-none)
- [x] AC6: fullWidth prop para botoes 100% largura
- [x] AC7: Framer Motion animations preservadas (hover/tap scale, disabled when loading)
- [x] AC8: Backward compatible — ButtonProps exported, variant/size types exported

## Scope
**IN:** Button variants, sizes, icon support, loading state, disabled styling
**OUT:** Button group component, split button, dropdown button

## Tasks
- [x] 1. Audited all 214 button patterns across 35+ files — classified into 9 categories
- [x] 2. Rewrote Button.tsx with 9 variants, 5 sizes, and full prop system
- [x] 3. Icon support via inline-flex gap-2 layout (children-based, not prop-based)
- [x] 4. Loading state with animated SVG spinner
- [x] 5. Disabled styling with opacity + cursor + pointer-events
- [x] 6. Backward compatibility verified — existing usages work
- [x] 7. ButtonProps, ButtonVariant, ButtonSize types exported

## File List
- `components/ui/Button.tsx` — Rewritten: 2 → 9 variants, fixed size → 5 sizes, loading/disabled/fullWidth props

## Estimated Effort: 6 hours
