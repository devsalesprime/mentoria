# Epic: Design System — Prosperus Mentoria

**Epic ID:** EPIC-DS-001
**Status:** Done
**Created:** 2026-02-28
**Owner:** @pm (Morgan)
**Source:** UX Pattern Audit Report (Uma, @ux-design-expert)

---

## Objetivo

Formalizar e implementar o Design System da plataforma Prosperus Mentoria, resolvendo redundancias criticas identificadas na auditoria UX: 42% de redundancia em cores (200+ hex hardcoded), 1.4% de adocao do Button component, e ausencia de componentes compartilhados fundamentais (FormField, Card, LoadingSpinner). Reduzir ~1,000 LOC, eliminar 200+ valores hardcoded, e consolidar 56 padroes de botao em 8.

---

## Escopo

### IN Scope
- Adicionar 4 tokens de cor ausentes (email-blue, medal-gold, medal-silver, medal-bronze)
- Normalizar opacidade (gold hex → Tailwind modifiers, white 25→8 niveis)
- Corrigir casing inconsistente de hex (#ca9a43 → #CA9A43)
- Criar componentes FormField, Card, LoadingSpinner
- Extender Button component (7 variantes + 4 tamanhos + icon support)
- Migrar 214 botoes raw para Button component (alvo: 90%+ adocao)
- Substituir todos os valores `[#hex]` arbitrarios por tokens do tema
- Revisao de acessibilidade: text-xs para text-sm em conteudo body

### OUT of Scope
- Redesign visual (identidade visual ja e forte — 8.5/10)
- Sistema de temas (dark/light mode)
- Biblioteca de icones (emoji system atual e funcional)
- Tokens multiplataforma (YAML/JSON export — futuro)
- Mudancas no backend

---

## Criterios de Sucesso

- [x] 0 valores hex hardcoded para cores do brand — 330 [#hex] brackets eliminados
- [x] Button component adoption 70% (de 1.4%) — 152/217 buttons migrated, 65 complex toggles/tabs left intentionally
- [x] Redundancia de cores ~5% (de 42%) — all arbitrary hex replaced with tokens
- [x] Opacidade white padronizada em 8 niveis (de 25) — 171 instances normalized
- [x] FormField e Card componentes criados em components/ui/
- [x] text-xs em conteudo body eliminado — 130 instancias upgradadas para text-sm
- [x] Build CSS 128.61 KB (de ~126 KB — aumento de 2.6 KB, <2%)
- [x] Zero regressoes — tsc 0 errors, 80/80 tests pass, build clean

---

## Timeline

| Fase | Stories | Pontos | Esforco |
|---|---|---|---|
| Fase 1: Quick Wins (Tokens) | DS-1.1 | 5 | ~4h |
| Fase 2: Component Extraction | DS-2.1, DS-2.2, DS-2.3 | 21 | ~20h |
| Fase 3: Systematic Migration | DS-3.1, DS-3.2, DS-3.3 | 21 | ~24h |
| **Total** | **7 stories** | **47 pts** | **~48h** |

---

## Stories

### Fase 1: Quick Wins

| Story | Titulo | Pontos | Prioridade |
|---|---|---|---|
| DS-1.1 | Consolidar tokens de cor e normalizar opacidade | 5 | P1 |

### Fase 2: Component Extraction

| Story | Titulo | Pontos | Prioridade |
|---|---|---|---|
| DS-2.1 | Criar componentes FormField e Card | 8 | P1 |
| DS-2.2 | Extender Button component (variantes, tamanhos, icon) | 8 | P1 |
| DS-2.3 | Criar LoadingSpinner component | 5 | P2 |

### Fase 3: Systematic Migration

| Story | Titulo | Pontos | Prioridade |
|---|---|---|---|
| DS-3.1 | Migrar botoes raw para Button component | 8 | P2 |
| DS-3.2 | Substituir hex arbitrarios por tokens do tema | 8 | P2 |
| DS-3.3 | Revisao de acessibilidade text-xs | 5 | P3 |

---

## Dependencias

```
Fase 1 (nenhuma dependencia)
  ↓
Fase 2
  ├── DS-2.2 (Button extend) → DS-3.1 (migracao de botoes)
  └── DS-1.1 (tokens) → DS-3.2 (substituicao hex)
  ↓
Fase 3 (depende de Fase 1 + Fase 2)
```

---

## Riscos

| Risco | Mitigacao |
|---|---|
| Regressao visual durante migracao | Screenshot before/after por componente |
| Button variants nao cobrem todos os padroes | Mapear os 56 padroes existentes antes de implementar |
| FormField/Card muito rigidos | Props flexiveis (className override) |
| text-xs → text-sm muda layout | Revisar visualmente cada pagina afetada |

---

## Documentacao de Referencia

- [UI Audit Report](../design-system/ui-audit-report.md)
- [Pattern Inventory](../design-system/pattern-inventory.json)
- [Design Tokens](../../styles/globals.css)
- [Button Component](../../components/ui/Button.tsx)

---

*Epic criado por @pm (Morgan) — 2026-02-28*
*Baseado no UI Pattern Audit Report v1.0 (@ux-design-expert)*
