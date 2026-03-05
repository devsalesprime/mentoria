# UX Specialist Review

**Phase 6: Brownfield Discovery**
**Reviewer:** @ux-design-expert
**Date:** 2026-02-28
**Source:** docs/prd/technical-debt-DRAFT.md (Frontend/UX section)

---

## Debts Validated

| ID | Debt | Original | Validated | Est. Hours | Priority | UX Impact |
|---|---|---|---|---|---|---|
| UX-01 | Tailwind CDN (~300KB+ unpurged) | CRITICAL | **CRITICAL** | 6h | P1 | First-load performance, SEO, LCP |
| UX-02 | No routing library | CRITICAL | **CRITICAL** | 20h | P1 | No deep-links, no back/forward, state lost on refresh |
| UX-03 | AdminPanel 1800+ LOC monolith | CRITICAL | **HIGH** (downgraded) | 16h | P2 | Dev velocity only — admin is internal tool |
| UX-04 | No React Error Boundary | CRITICAL | **CRITICAL** | 4h | P1 | White screen of death on any JS error |
| UX-05 | Inconsistent design tokens | HIGH | **HIGH** | 10h | P2 | Theme changes require grep-and-replace across 40+ files |
| UX-06 | Dead components (Delivery, ActionPlan) | HIGH | **HIGH** | 1h | P1 | Bundle size, confusion, stale type refs |
| UX-07 | AudioRecorder ships despite hidden | HIGH | **MEDIUM** (downgraded) | 2h | P3 | ~5KB impact after tree-shaking (minor) |
| UX-08 | Modal lacks focus trap + Escape | HIGH | **HIGH** | 4h | P1 | WCAG 2.1 AA violation for dialog pattern |
| UX-09 | Contrast failures (white/20-40) | HIGH | **HIGH** | 8h | P2 | WCAG AA failure for secondary text |
| UX-10 | Dashboard props dual shape | HIGH | **MEDIUM** (downgraded) | 3h | P3 | Dev confusion only, no user impact |
| UX-11 | No semantic HTML landmarks | MEDIUM | **MEDIUM** | 6h | P3 | Screen reader navigation impossible |
| UX-12 | Wizard dots too small (10px) | MEDIUM | **HIGH** (upgraded) | 3h | P2 | Touch targets fail on mobile — primary use case |
| UX-13 | No focus management on transitions | MEDIUM | **MEDIUM** | 4h | P3 | Screen reader disorientation |
| UX-14 | AudioRecorder English in PT app | MEDIUM | **LOW** (downgraded) | 1h | P4 | Feature is hidden, so text isn't visible |
| UX-15 | Import map leftover | MEDIUM | **LOW** | 0.5h | P4 | No runtime impact, just confusion |
| UX-16 | Base path mismatch | MEDIUM | **MEDIUM** | 1h | P2 | Could cause asset loading issues |
| UX-17 | DOMPurify+marked duplicated | MEDIUM | **MEDIUM** | 2h | P3 | Two implementations diverging over time |
| UX-18 | Legacy progress calc exported | MEDIUM | **LOW** (downgraded) | 0.5h | P4 | Dead code, zero runtime impact |
| UX-19 | Logo loads external SVG | LOW | **LOW** | 1h | P4 | External dependency for branding |
| UX-20 | Index as AnimatePresence key | LOW | **LOW** | 0.5h | P4 | Rare animation glitch |
| UX-21 | Vite/plugin-react in deps+devDeps | LOW | **LOW** | 0.5h | P4 | Package hygiene |

---

## Debts Added (not in original DRAFT)

| ID | Debt | Severity | Est. Hours | Priority | Details |
|---|---|---|---|---|---|
| UX-22 | **No loading skeleton for diagnostic modules** | MEDIUM | 4h | P3 | When useDiagnosticPersistence loads data, modules render with empty state briefly, causing content shift. Need skeleton loading. |
| UX-23 | **No 404/catch-all view** | MEDIUM | 2h | P2 | If state gets corrupted, user sees blank content area. Need fallback view. |
| UX-24 | **Mobile sidebar has no swipe gesture** | LOW | 4h | P4 | Mobile users expect swipe-to-close on overlay sidebar. Currently click-only. |
| UX-25 | **No form validation feedback on diagnostic modules** | MEDIUM | 8h | P2 | Users can submit empty modules. No inline validation messages. No required field indicators (despite aria-required on some fields). |
| UX-26 | **Admin session lost on page refresh** | HIGH | 3h | P1 | Admin token stored in React state only (not localStorage). Any refresh forces re-login. This is a significant usability issue for the admin user. |

---

## Answers to @architect Questions

### Q1: Standardize dark background hex values?
**YES.** Recommended mapping:

| Current Raw Hex | Map To Token |
|---|---|
| `#031A2B` | `prosperus-navy` (already exists) |
| `#051522`, `#0B1426` | `prosperus-navy-dark` (already exists) |
| `#0A2540`, `#08243b` | `prosperus-navy-light` (already exists) |
| `#061e33`, `#081e30` | **New token: `prosperus-navy-mid`** (#071d2f) |

Add one new token (`prosperus-navy-mid`) and replace all 6+ raw hex values with the 4 named tokens. This makes theme changes a single config edit.

### Q2: Hash routing vs history routing?
**History routing (recommended).** Rationale:
- Cleaner URLs (`/dashboard/mentor` vs `/#/dashboard/mentor`)
- Better analytics tracking
- SEO-friendly (if needed later)
- Express already has SPA fallback (`res.sendFile('index.html')` for all non-API routes)
- No additional server config needed

Use `react-router-dom` v6+ with `createBrowserRouter`. Suggested route structure:
```
/                    → Landing page
/login               → LoginModal (or /auth)
/dashboard           → Dashboard (overview)
/dashboard/:module   → Module view (mentor, mentee, etc.)
/brand-brain         → BrandBrainViewer
/assets              → AssetDeliveryHub
/assets/:assetId     → Individual asset view
/admin               → AdminPanel (auth-gated)
/admin/users/:id     → User detail
/admin/pipeline      → Pipeline view
```

### Q3: AdminPanel decomposition strategy?
**By feature (recommended):**

```
components/admin/
├── AdminLayout.tsx          # Shell with navigation
├── AdminUserList.tsx        # User table + search
├── AdminUserDetail.tsx      # Individual user view
├── AdminPipeline.tsx        # Pipeline management
├── AdminBrandBrain.tsx      # BB generation/management
├── AdminAssets.tsx           # Asset generation
└── hooks/
    ├── useAdminUsers.ts     # User CRUD logic
    └── useAdminPipeline.ts  # Pipeline logic
```

Feature-based splits naturally align with admin workflows. Each file would be 200-400 LOC. Shared types stay in `types/pipeline.ts`.

### Q4: Modal fix — Radix or manual?
**@radix-ui/react-dialog (recommended).** Rationale:
- Built-in focus trap, Escape handling, scroll lock, portal rendering
- Zero-styling approach — works with existing Tailwind classes
- 3KB gzipped — minimal bundle impact
- Battle-tested accessibility
- Drop-in replacement for current Modal.tsx
- Same API pattern: `<Dialog.Root>`, `<Dialog.Trigger>`, `<Dialog.Content>`

Manual implementation would require: `focus-trap-react` + custom Escape handler + scroll lock logic + aria attributes — more work, more bugs.

---

## Design Recommendations

### Color Contrast Fix (UX-09)
Replace all instances:
- `text-white/20` → `text-white/50` minimum (ratio ~5:1 on #031A2B)
- `text-white/30` → `text-white/50` minimum
- `text-white/40` → `text-white/50` minimum
- `text-white/50` → acceptable (ratio ~5.2:1)
- For decorative text only: `text-white/30` is acceptable if accompanied by other visual cues

### Touch Target Fix (UX-12)
Wizard step dots: keep visual size at 10px but add invisible touch area:
```tsx
<button className="relative p-3"> {/* 44px touch area */}
  <span className="w-2.5 h-2.5 rounded-full bg-white/30" /> {/* 10px visual */}
</button>
```

### Error Boundary Strategy (UX-04)
Two levels:
1. **App-level boundary** → catches everything, shows "Something went wrong" with refresh button
2. **Module-level boundary** → wraps each diagnostic module, shows "This module had an error" with retry, doesn't crash other views

---

## Summary

| Severity | Count | Original | After Review |
|---|---|---|---|
| CRITICAL | 3 | 4 | 3 (-1 downgraded) |
| HIGH | 6 | 6 | 6 (-2 downgraded, +1 upgraded, +1 new) |
| MEDIUM | 8 | 7 | 8 (-2 downgraded, +3 new) |
| LOW | 8 | 4 | 8 (-3 downgraded from MEDIUM, +1 new) |
| **Total** | **25** | **21** | **21 + 5 new = 26** |

**Estimated total effort for all UX debts: ~115 hours**
**Critical path (P0+P1): ~38 hours**

---

*Review completed by @ux-design-expert — 2026-02-28*
