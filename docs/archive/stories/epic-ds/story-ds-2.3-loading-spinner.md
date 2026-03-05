# Story DS-2.3: Criar LoadingSpinner Component

**Epic:** EPIC-DS-001 | **Status:** Done | **Points:** 5 | **Priority:** P2 | **Phase:** 2

## Descricao
O codebase tem 10+ implementacoes inline de estados de loading, cada uma com estilo ligeiramente diferente. LoadingSpinner padronizado criado com variantes de tamanho e texto opcional.

## Acceptance Criteria
- [x] AC1: LoadingSpinner component criado em components/ui/ com props: size (sm/md/lg), label (optional text), className
- [x] AC2: Animacao SVG com animate-spin, cor prosperus-gold-dark
- [x] AC3: 3 tamanhos: sm (h-4 w-4), md (h-6 w-6), lg (h-10 w-10)
- [x] AC4: Label opcional exibido ao lado do spinner
- [x] AC5: Build passa sem erros

## Scope
**IN:** LoadingSpinner component creation
**OUT:** Migration of inline loading states (available for incremental adoption), skeleton loaders, progress bars

## Tasks
- [x] 1. Create LoadingSpinner component with SVG animation
- [x] 2. Implement 3 size variants
- [x] 3. Add optional label support
- [x] 4. Export types (LoadingSpinnerProps, SpinnerSize)

## File List
- `components/ui/LoadingSpinner.tsx` — NEW: SVG spinner with gold color, 3 sizes, optional label

## Estimated Effort: 3 hours
