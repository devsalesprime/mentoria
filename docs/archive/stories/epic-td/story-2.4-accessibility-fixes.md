# Story 2.4: Corrigir Acessibilidade (Contraste, Focus Trap, Touch)

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 8 | **Priority:** P2 | **Phase:** 2

## Descricao
Multiplas violacoes WCAG AA: contraste insuficiente (text-white/20-40), modal sem focus trap, wizard dots muito pequenos para touch, sem landmarks semanticos parciais.

## Acceptance Criteria
- [x] AC1: All text has minimum WCAG AA contrast ratio (4.5:1) — text-white/50 minimum
- [x] AC2: Modal traps focus (Tab cycles within modal) — Radix Dialog
- [x] AC3: Modal closes on Escape key press — Radix Dialog
- [x] AC4: Wizard step dots have minimum 44px touch target
- [x] AC5: @radix-ui/react-dialog installed and used for Modal
- [x] AC6: Build verification passes (axe-core deferred to Story 3.5)

## Scope
**IN:** Contrast fixes, Modal focus trap (Radix), touch targets, partial landmarks
**OUT:** Full semantic HTML rewrite, screen reader testing, skip navigation

## Tasks
- [x] 1. npm install @radix-ui/react-dialog
- [x] 2. Rewrite ui/Modal.tsx using Radix Dialog (preserve styling, add focus trap + Escape)
- [x] 3. Replace all text-white/20 with text-white/50 (16 occurrences)
- [x] 4. Replace all text-white/30 with text-white/50 (81 occurrences)
- [x] 5. Replace all text-white/40 with text-white/50 (94 occurrences)
- [x] 6. Add 44px touch target wrapper to wizard step dots (4 modules)
- [x] 7. Add main/nav/aside/header landmarks to Dashboard layout
- [x] 8. Build verification passes

## Dev Notes
- 191 total contrast replacements across 25 component files
- Wizard dots: outer button is 44x44px (w-11 h-11), inner span is visual 10px dot
- Radix Dialog provides: focus trap, Escape to close, aria-modal, role="dialog"
- Dashboard landmarks: aside (aria-label), nav (aria-label), header, main

## File List
- `components/ui/Modal.tsx` — REWRITTEN: Radix Dialog with AnimatePresence
- `components/Dashboard.tsx` — MODIFIED: semantic landmarks (aside, nav, header, main)
- `components/modules/MentorModule.tsx` — MODIFIED: 44px touch target for step dots
- `components/modules/MenteeModule.tsx` — MODIFIED: 44px touch target for step dots
- `components/modules/MethodModule.tsx` — MODIFIED: 44px touch target for step dots
- `components/modules/OfferModule.tsx` — MODIFIED: 44px touch target for step dots
- 25 component files — MODIFIED: text-white opacity contrast fixes

## Debts Resolved: UX-05, UX-07, UX-08, UX-11 (partial)
## Estimated Effort: 12 hours
