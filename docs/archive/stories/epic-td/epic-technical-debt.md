# Epic: Resolucao de Debitos Tecnicos — Prosperus Mentoria

**Epic ID:** EPIC-TD-001
**Status:** Draft
**Created:** 2026-02-28
**Owner:** @pm (Morgan)

---

## Objetivo

Resolver os 68 debitos tecnicos identificados na auditoria Brownfield Discovery, priorizando seguranca (CRITICO), infraestrutura de qualidade (ALTO), e otimizacao de codigo (MEDIO), em 3 fases ao longo de 8-10 semanas.

---

## Escopo

### IN Scope
- Todas as 10 vulnerabilidades de seguranca criticas
- Framework de testes (Vitest)
- Tailwind CSS build pipeline
- React Router
- Acessibilidade (WCAG AA)
- Refatoracao de componentes grandes
- Correcoes de banco de dados
- Error boundaries

### OUT of Scope
- Novas features de produto
- Migracao para PostgreSQL (apenas monitoramento)
- Redesign visual completo
- Internacionalizacao (i18n)

---

## Criterios de Sucesso

- [ ] 0 vulnerabilidades criticas no npm audit
- [ ] Admin login com bcrypt
- [ ] Tailwind CSS purged <50KB
- [ ] React Router com deep-links funcionais
- [ ] Cobertura de testes >60%
- [ ] Nenhum componente >500 LOC
- [ ] WCAG AA compliance
- [ ] Security headers grade A

---

## Timeline

| Fase | Semanas | Stories | Horas | Custo |
|---|---|---|---|---|
| Fase 1: Seguranca & Quick Wins | 1-2 | Stories 1.1-1.4 | ~20h | R$ 3.000 |
| Fase 2: Fundacao | 3-6 | Stories 2.1-2.6 | ~100h | R$ 15.000 |
| Fase 3: Otimizacao | 7-10 | Stories 3.1-3.5 | ~120h | R$ 18.000 |
| **Total** | **10** | **15 stories** | **~280h** | **R$ 42.000** |

---

## Stories

### Fase 1: Seguranca & Quick Wins

| Story | Titulo | Pontos | Prioridade |
|---|---|---|---|
| 1.1 | Rotacionar credenciais e proteger segredos | 3 | P0 |
| 1.2 | Implementar hardening de seguranca do servidor | 5 | P0 |
| 1.3 | Remover codigo morto e dependencias nao utilizadas | 2 | P1 |
| 1.4 | Adicionar React Error Boundary | 3 | P1 |

### Fase 2: Fundacao

| Story | Titulo | Pontos | Prioridade |
|---|---|---|---|
| 2.1 | Instalar framework de testes (Vitest) e testes iniciais | 8 | P1 |
| 2.2 | Migrar Tailwind CSS de CDN para build pipeline | 5 | P1 |
| 2.3 | Implementar React Router com deep-linking | 13 | P1 |
| 2.4 | Corrigir acessibilidade (contraste, focus trap, touch) | 8 | P2 |
| 2.5 | Correcoes de schema e performance do banco | 8 | P1 |
| 2.6 | Consolidar design tokens e corrigir configs | 5 | P2 |

### Fase 3: Otimizacao

| Story | Titulo | Pontos | Prioridade |
|---|---|---|---|
| 3.1 | Decompor AdminPanel em sub-componentes | 8 | P2 |
| 3.2 | Decompor BrandBrainViewer e eliminar duplicacoes | 8 | P2 |
| 3.3 | Promisificar API SQLite + input validation | 8 | P3 |
| 3.4 | Habilitar TypeScript strict mode | 5 | P3 |
| 3.5 | Completar cobertura de testes (>60%) + backlog | 8 | P3 |

---

## Dependencias

```
Fase 1 (nenhuma dependencia)
  ↓
Fase 2
  ├── Story 2.1 (Vitest) → GATE para Fase 3 (testes antes de refatorar)
  ├── Story 2.2 (Tailwind build) → Story 2.6 (design tokens)
  └── Story 2.3 (Router) → Story 3.1/3.2 (decomposicao de componentes)
  ↓
Fase 3 (depende de 2.1 minimo)
```

---

## Riscos

| Risco | Mitigacao |
|---|---|
| Breach antes de rotacionar credenciais | Fazer HOJE, nao esperar sprint |
| Regressao durante refatoracao | Testes primeiro (Story 2.1) |
| Mudanca visual com Tailwind build | Screenshot before/after |
| Rotas quebram fluxos existentes | Implementar incrementalmente |

---

## Documentacao de Referencia

- [Assessment Tecnico Completo](../prd/technical-debt-assessment.md)
- [Relatorio Executivo](../reports/TECHNICAL-DEBT-REPORT.md)
- [Arquitetura do Sistema](../architecture/system-architecture.md)
- [Schema do Banco](../database/SCHEMA.md)
- [Auditoria do Banco](../database/DB-AUDIT.md)
- [Spec Frontend/UX](../frontend/frontend-spec.md)

---

*Epic criado por @pm (Morgan) — 2026-02-28*
*Baseado no Technical Debt Assessment v1.0*
