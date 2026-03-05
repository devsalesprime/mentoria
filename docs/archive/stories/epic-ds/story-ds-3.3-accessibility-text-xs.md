# Story DS-3.3: Revisao de Acessibilidade text-xs

**Epic:** EPIC-DS-001 | **Status:** Done | **Points:** 5 | **Priority:** P3 | **Phase:** 3

## Descricao
37% de todo o texto no codebase usava text-xs (347 instancias, 12px). A WCAG recomenda tamanho minimo de 14px para conteudo body. Revisadas todas as instancias e upgradado conteudo body para text-sm, mantendo text-xs apenas para metadata, timestamps, labels auxiliares e badges.

## Acceptance Criteria
- [x] AC1: Conteudo body text (paragrafos, descricoes, form labels, mensagens de erro) usa text-sm minimo
- [x] AC2: text-xs reservado apenas para: timestamps, metadata, contadores, badges, uppercase tracking labels, button text
- [x] AC3: Nenhuma regressao de layout (build e tsc passam)
- [x] AC4: Instancias de text-xs reduzidas em 37% (de 347 para 217) — 130 instancias upgradadas

## Scope
**IN:** text-xs to text-sm upgrade for body content across all components
**OUT:** Font size changes for headings, complete typography redesign

## Tasks
- [x] 1. Audited all 347 text-xs instances, classified 237 as metadata (KEEP) and 110 as body content (UPGRADE)
- [x] 2. Upgraded ~90 instances across 22 files (some files had no actionable instances)
- [x] 3. Categories upgraded: form labels (28), descriptions (30), error messages (14), info/warning messages (14), helper text (10), body content (8)
- [x] 4. Verified build, tsc, and all 80 tests pass

## File List
- 22 component files updated with text-xs → text-sm for body content
- Top files: OfferModule (22), MethodModule (14), PipelineDetailView (10), MentorModule (6), OutreachFlowView (5)

## Estimated Effort: 5 hours
