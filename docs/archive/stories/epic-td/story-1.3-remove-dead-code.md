# Story 1.3: Remover Codigo Morto e Dependencias Nao Utilizadas

**Epic:** EPIC-TD-001
**Status:** Done
**Points:** 2
**Priority:** P1
**Phase:** 1 — Seguranca & Quick Wins

---

## Descricao

A aplicacao contem componentes mortos (DeliveryModule, ActionPlanModule), dependencias nunca importadas (mysql2, nodemailer), conflitos de versao (Vite v7/v6), e arquivos de backup no diretorio raiz.

## Acceptance Criteria

- [x] AC1: Given components/modules/, When listed, Then DeliveryModule.tsx does not exist
- [x] AC2: Given components/modules/, When listed, Then ActionPlanModule.tsx does not exist
- [x] AC3: Given package.json dependencies, When checked, Then mysql2 is not listed
- [x] AC4: Given package.json dependencies, When checked, Then nodemailer is not listed
- [x] AC5: Given package.json, When checked, Then only one version of vite exists (in devDependencies)
- [x] AC6: Given package.json, When checked, Then @vitejs/plugin-react is only in devDependencies
- [x] AC7: Given package.json, When checked, Then @types/dompurify is in devDependencies
- [x] AC8: Given project root, When listed, Then server.cjs.backup does not exist
- [x] AC9: Given npm run build, When executed, Then build succeeds with no errors
- [x] AC10: Given utils/progress.ts, When checked, Then calculateProgressLegacy is removed

## Scope

**IN:** Delete dead files, remove unused deps, fix version conflicts, clean package.json metadata
**OUT:** Refactoring live code, adding new code

## Tasks

- [x] 1. Delete components/modules/DeliveryModule.tsx
- [x] 2. Delete components/modules/ActionPlanModule.tsx
- [x] 3. Delete server.cjs.backup
- [x] 4. npm uninstall mysql2 nodemailer
- [x] 5. Move vite and @vitejs/plugin-react to devDependencies only
- [x] 6. Move @types/dompurify to devDependencies
- [x] 7. Remove calculateProgressLegacy from utils/progress.ts
- [x] 8. Update package.json: version "1.0.0", main "server.cjs"
- [x] 9. Run npm install to regenerate lock file
- [x] 10. Verify build: npm run build ✓

## Debts Resolved

UX-06, DEP-01, DEP-02, BUILD-03, UX-21, UX-24, ARCH-09, ARCH-10

## Estimated Effort: 3 hours

## File List

- [x] components/modules/DeliveryModule.tsx (DELETED)
- [x] components/modules/ActionPlanModule.tsx (DELETED)
- [x] server.cjs.backup (DELETED)
- [x] package.json (updated — v1.0.0, main server.cjs, deps cleaned)
- [x] package-lock.json (regenerated)
- [x] utils/progress.ts (calculateProgressLegacy + ModuleData removed)
