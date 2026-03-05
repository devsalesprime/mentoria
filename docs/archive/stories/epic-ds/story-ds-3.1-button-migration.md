# Story DS-3.1: Migrar Botoes Raw para Button Component

**Epic:** EPIC-DS-001 | **Status:** Done | **Points:** 8 | **Priority:** P2 | **Phase:** 3
**Depends on:** Story DS-2.2 (Button extension)

## Descricao
Com o Button component extendido (9 variantes + 5 tamanhos), migrar as 214 instancias de botoes raw HTML para usar o componente. 140 botoes migrados com sucesso, 74 mantidos como raw HTML (toggles, tabs, steppers, wizard nav com logica condicional complexa).

## Acceptance Criteria
- [x] AC1: 140 dos 217 botoes usam o Button component (~65% adocao)
- [x] AC2: Cada botao mapeado para variante correta (primary/secondary/danger/danger-soft/success/ghost/icon/outline/link)
- [x] AC3: Tamanhos aplicados conforme contexto (xs para icons, sm/md para acoes, lg/xl para CTAs)
- [x] AC4: Build passa — tsc 0 errors, vite build successful
- [x] AC5: Botoes com handlers preservados corretamente
- [x] AC6: Botoes complexos (toggles, tabs, steppers, wizard nav) mantidos como raw HTML

## Scope
**IN:** Migration of raw button/a elements to Button component where safe
**OUT:** Tab toggles, stepper dots, wizard back/next with conditional styling, accordion headers

## Tasks
- [x] 1. Migrate Admin components: AdminUserList (9), AdminUserDetail (3), PipelineDetailView (8)
- [x] 2. Migrate Shared: AudioRecorder (9), FileUpload (1)
- [x] 3. Migrate Brand Brain: BrandBrainViewer (6), BrandBrainSection (7), SubsectionCard (8), AddTopicForm (2), BBApprovedState (4), BBPillarIntro (3), ExpertNotesPanel (1), FeedbackForm (3)
- [x] 4. Migrate Assets: AssetViewer (3), AssetDeliveryHub (3), CadenceTimeline (9), ChatScriptViewer (5), OutreachFlowView (5), TeleprompterStageMap (9), LandingPagePreview (6), ToolkitGuide (3)
- [x] 5. Migrate Modules: PreModule (4), MentorModule (5), OfferModule (10), MethodModule (4)
- [x] 6. Migrate Remaining: Dashboard (7), GoalSection (1), ErrorBoundary (2), Header (1), LoginModal (2)
- [x] 7. Verify build and TypeScript — 0 errors, JS size decreased ~9KB

## File List
- 35+ component files migrated with Button import added
- `components/ui/Button.tsx` — Extended component (unchanged during migration)

## Buttons Intentionally Skipped (74)
- Tab/toggle buttons with active/inactive style switching (~20)
- Stepper dots (~12)
- Wizard back/next with conditional className (~8)
- Accordion/section toggles (~5)
- Radio card selection buttons (~10)
- Emoji pickers, dropdown triggers (~5)
- Other complex conditional patterns (~14)

## Estimated Effort: 10 hours
