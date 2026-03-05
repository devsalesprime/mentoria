# Frontend/UX Specification — Prosperus Mentoria Platform

**Phase 3: Brownfield Discovery**
**Agent:** @ux-design-expert
**Date:** 2026-02-28

---

## 1. Component Inventory

### Summary
| Category | Count | Notes |
|---|---|---|
| Total TSX components | ~42 | |
| Estimated frontend LOC | ~12,000+ | |
| UI primitives (ui/) | 3 | Button, Modal, Logo |
| Shared components | 7 | Reusable inputs/displays |
| Module wizards | 7 | 5 active, 2 dead |
| Asset viewers | 10 | Paradigm-specific renders |
| Custom hooks | 1 | useDiagnosticPersistence |
| Dead/dormant files | 3 | DeliveryModule, ActionPlanModule, legacy progress |

### Mega Components (>900 LOC)
| Component | Lines | Status |
|---|---|---|
| BrandBrainViewer.tsx | 2,037 | Active — needs decomposition |
| AdminPanel.tsx | 1,519 | Active — monolith |
| OutreachFlowView.tsx | 1,106 | Active |
| MethodModule.tsx | 1,008 | Active |
| OfferModule.tsx | 994 | Active |

---

## 2. Design System

### CSS Framework
- **Tailwind CSS via CDN** (`<script src="https://cdn.tailwindcss.com">`)
- No `tailwind.config.js` — config inline in HTML `<script>` block
- No PostCSS, no purging, no tree-shaking (~300KB+ shipped)
- No IDE autocompletion for custom tokens

### Color Palette (Design Tokens)
```
prosperus-gold-light:   #FFE39B
prosperus-gold:         #FFDA71  (DEFAULT)
prosperus-gold-dark:    #CA9A43
prosperus-navy-light:   #123F5B
prosperus-navy:         #031A2B  (DEFAULT)
prosperus-navy-dark:    #020f19
prosperus-neutral-white: #FCF7F0
prosperus-neutral-grey:  #EDF4F7
prosperus-neutral-black: #080808
```

**Problem:** Many components bypass tokens with raw hex values:
- `bg-[#0A2540]`, `bg-[#051522]`, `bg-[#061e33]`, `bg-[#081e30]`, `bg-[#08243b]`, `bg-[#0B1426]`
- At least 6+ different "dark" backgrounds without token names

### Typography
- Serif: "EB Garamond" (headings)
- Sans: "Manrope" (body, labels, UI)
- No formal type scale — ad-hoc text-xs to text-8xl
- **Below accessibility minimum:** text-[9px] and text-[10px] used

### Icons
- Bootstrap Icons (CDN) — used in DeliveryModule only
- Emoji icons — used everywhere else (no icon library)
- Inline SVG — occasional

### Animation
- framer-motion — sole animation library
- `useReducedMotion()` properly respected in most components

---

## 3. Layout Patterns

### Page Structure (3 states)
1. **Landing** (unauthenticated): Full-page sections with fixed Header/Footer
2. **Dashboard** (member): Sidebar + main content, no footer
3. **AdminPanel** (admin): Full-width single view

### Navigation
- Landing: Fixed header with scroll-to navigation
- Dashboard sidebar: Collapsible sections, status dots, mobile slide-in overlay
- Asset Hub: Tab-based phase navigation
- **No URL routing** — all state-driven

### Responsive Breakpoints
- sm: 640px, md: 768px, lg: 1024px, xl: 1280px (standard Tailwind)
- **Desktop-first approach** despite Tailwind's mobile-first convention
- AdminPanel has minimal mobile adaptation

---

## 4. User Flows

### Authentication
1. User clicks "Area do Membro" or "Comecar Diagnostico"
2. LoginModal: email-only (member) or email+password (admin)
3. JWT stored in localStorage
4. Session restored on page load via JWT decode

### Diagnostic Journey
1. OverviewPanel → sequential modules (pre → mentor → mentee → method → offer)
2. Each module: multi-step wizard with auto-save
3. Module completion → CelebrationOverlay → auto-advance
4. "diagnostic_complete" → submit → backend pipeline begins
5. Brand Brain appears → mentor reviews/approves sections
6. Assets generated → AssetDeliveryHub

---

## 5. Accessibility (a11y)

### Good Practices
- role="radiogroup" / role="radio" + aria-checked on selection cards
- aria-expanded on accordions
- aria-live="polite" on step indicators
- aria-current="step" on active step dots
- aria-required on required fields
- useReducedMotion() respected

### Missing/Incomplete
- Modal lacks focus trap and Escape key handling (WCAG violation)
- No skip navigation link
- No semantic HTML landmarks (all divs, no main/nav/aside)
- Dashboard hamburger has no aria-label/aria-expanded
- TextOrAudioInput tabs lack role="tablist"/role="tab" semantics
- No focus management on view transitions

### Contrast Failures
- text-white/20, text-white/30, text-white/40 on dark backgrounds likely fail WCAG AA (4.5:1)
- Status dots are tiny (1.5-2.5px) color-only indicators without alternatives

---

## 6. State Management

- No state library — React useState/useEffect only
- Single custom hook: useDiagnosticPersistence (all diagnostic data + auto-save)
- Auth state in App.tsx via prop drilling
- No Context providers

### Loading States
- Present: save indicator, skeleton loading (assets), file upload, login
- Missing: initial data fetch, global loading, no error boundary

### Error States
- Present: save errors, asset fetch retry, file errors, login errors
- Missing: no React Error Boundary, no offline detection, AudioRecorder errors console-only

### Empty States
- Present: assets "em preparacao", bonus section, dashboard fallback
- Missing: testimonials list, audio recordings, files section

---

## 7. UX Debts Identified

### CRITICAL
| ID | Description |
|---|---|
| UX-01 | No CSS build pipeline for Tailwind (~300KB+ shipped unpurged) |
| UX-02 | No routing library — no deep-linking, no browser back/forward |
| UX-03 | AdminPanel is a 1800+ line monolith |
| UX-04 | No React Error Boundary — JS error crashes entire app |

### HIGH
| ID | Description |
|---|---|
| UX-05 | Inconsistent design token usage (6+ raw hex dark backgrounds) |
| UX-06 | Two dead components (DeliveryModule, ActionPlanModule) |
| UX-07 | AudioRecorder code ships despite feature being hidden |
| UX-08 | Modal lacks focus trap and Escape key (WCAG violation) |
| UX-09 | Accessibility contrast failures (text-white/20-40 on dark) |
| UX-10 | Dashboard props have dual shape (confusing API) |

### MEDIUM
| ID | Description |
|---|---|
| UX-11 | No semantic HTML landmarks (all divs) |
| UX-12 | Step wizard dots too small for touch (10px vs 44px min) |
| UX-13 | No focus management on view transitions |
| UX-14 | AudioRecorder has English text in Portuguese app |
| UX-15 | Import map leftover from AI Studio in index.html |
| UX-16 | Base path mismatch (vite vs html base tag) |
| UX-17 | DOMPurify + marked duplicated in BrandBrainViewer and assets/shared |
| UX-18 | Legacy progress calculation still exported (unused) |

### LOW
| ID | Description |
|---|---|
| UX-19 | Logo loads external SVG from salesprime.com.br |
| UX-20 | Array index as key in AnimatePresence error list |
| UX-21 | Vite/plugin-react duplicated in deps and devDeps |
