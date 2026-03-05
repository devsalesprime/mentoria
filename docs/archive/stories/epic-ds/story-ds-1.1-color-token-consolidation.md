# Story DS-1.1: Consolidar Tokens de Cor e Normalizar Opacidade

**Epic:** EPIC-DS-001 | **Status:** Done | **Points:** 5 | **Priority:** P1 | **Phase:** 1

## Descricao
A auditoria UX identificou 200+ valores hex hardcoded que ignoram os 19 design tokens existentes, 25 niveis de opacidade white (apenas 8 necessarios), 10 variantes de opacidade gold em hex ao inves de Tailwind modifiers, e 80 instancias de casing inconsistente (#ca9a43 vs #CA9A43). Tambem faltam 4 tokens usados frequentemente (email-blue, medal-gold, medal-silver, medal-bronze).

## Acceptance Criteria
- [x] AC1: 4 novos tokens adicionados a globals.css @theme: email (#4A9BD9), medal-gold (#FFD700), medal-silver (#C0C0C0), medal-bronze (#CD7F32)
- [x] AC2: Todas as 310 instancias de [#CA9A43] (bare + opacity) substituidas por prosperus-gold-dark token
- [x] AC3: White opacity padronizada em 8 niveis: /5, /10, /20, /30, /50, /60, /70, /90 — 171 instancias nao-padrao normalizadas
- [x] AC4: Todos os hex brackets eliminados: [#FFE39B]→gold-light, [#D4B050]→gold-hover, [#25D366]→whatsapp, [#4A9BD9]→email, medals, navy
- [x] AC5: Build passa (126.28 KB CSS / 17.42 KB gzip) e tsc --noEmit sem erros

## Scope
**IN:** Token additions, opacity normalization, casing fix, gold hex replacement
**OUT:** Full hex-to-token migration (Story DS-3.2), component changes

## Tasks
- [x] 1. Add 4 new color tokens to globals.css @theme (email, medal-gold, medal-silver, medal-bronze)
- [x] 2. Replace all 310 [#CA9A43] instances with prosperus-gold-dark token (35 files)
- [x] 3. Replace 20 other hex brackets: [#FFE39B], [#D4B050], [#25D366], [#4A9BD9], medals, navy
- [x] 4. Normalize 73 non-standard white/N opacity levels to 8-level standard
- [x] 5. Normalize 98 arbitrary white/[decimal] opacity levels to standard
- [x] 6. Verify build passes and TypeScript clean

## File List
- `styles/globals.css` — Added 4 new tokens (email, medal-gold, medal-silver, medal-bronze)
- 35 component/utility files — 330 [#hex] bracket values replaced with theme tokens
- ~28 files — 171 non-standard white opacity values normalized to 8 levels

## Estimated Effort: 4 hours
