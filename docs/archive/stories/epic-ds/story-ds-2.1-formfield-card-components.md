# Story DS-2.1: Criar Componentes FormField e Card

**Epic:** EPIC-DS-001 | **Status:** Done | **Points:** 8 | **Priority:** P1 | **Phase:** 2
**Depends on:** Story DS-1.1

## Descricao
FormField (label + input + error) e duplicado 40+ vezes no codebase, representando ~500 LOC de redundancia. Card (bg-white/5 border rounded-xl p-4) e repetido 60+ vezes (~300 LOC de redundancia). Componentes reutilizaveis criados para ambos.

## Acceptance Criteria
- [x] AC1: FormField component criado em components/ui/ com props: label, error, required, children, className, labelClassName, hint
- [x] AC2: Card component criado em components/ui/ com props: children, className, padding (compact/standard/generous/none), variant (default/elevated/outlined), onClick
- [x] AC3: Components ready for adoption across codebase
- [x] AC4: TypeScript types exportados para ambos os componentes
- [x] AC5: Build passa sem erros

## Scope
**IN:** FormField component, Card component creation
**OUT:** Full migration of existing patterns (available for incremental adoption)

## Tasks
- [x] 1. Create FormField component with label, error, required, hint support
- [x] 2. Create Card component with 3 variants and 4 padding options
- [x] 3. Export all types (CardProps, CardVariant, CardPadding, FormFieldProps)
- [x] 4. Verify build and TypeScript

## File List
- `components/ui/FormField.tsx` — NEW: Label + children + error/hint wrapper
- `components/ui/Card.tsx` — NEW: 3 variants (default/elevated/outlined), 4 padding levels, interactive onClick support

## Estimated Effort: 8 hours
