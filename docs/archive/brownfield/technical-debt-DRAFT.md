# Technical Debt Assessment — DRAFT

**Project:** Prosperus Mentoria Platform
**Date:** 2026-02-28
**Status:** Para Revisão dos Especialistas
**Assessed by:** @architect (Aria), with data from @data-engineer (Dara) and @ux-design-expert

---

## Executive Summary

The Prosperus Mentoria platform is a functional full-stack application (React 19 + Express 5 + SQLite) that serves its core purpose — diagnostic questionnaire, brand brain generation, and asset delivery — effectively. However, the codebase carries significant technical debt across three areas: **security** (critical), **code organization** (high), and **UX/accessibility** (medium-high).

**Total debts identified: 64**
- Critical: 12
- High: 13
- Medium: 23
- Low: 16

---

## 1. System-Level Debts (validated by @architect)

### CRITICAL

| ID | Debt | Category | File | Impact |
|---|---|---|---|---|
| TD-SYS-01 | Plaintext admin password comparison | Security | auth.cjs:217 | Password exposure |
| TD-SYS-02 | Hardcoded JWT secret fallback | Security | server.cjs:26 | Auth bypass |
| TD-SYS-03 | Hardcoded credentials in PM2 config | Security | ecosystem.config.cjs:15 | Credential leak |
| TD-SYS-04 | Wide-open CORS (origin: '*') | Security | server.cjs:49 | Cross-origin attacks |
| TD-SYS-05 | No rate limiting | Security | server.cjs | Brute-force attacks |
| TD-SYS-06 | No security headers (no helmet) | Security | server.cjs | XSS/clickjacking |
| TD-SYS-07 | Gemini API key in frontend bundle | Security | vite.config.ts:15 | Key theft |
| TD-SYS-08 | Debug logging of sensitive info | Security | auth.cjs:209-210 | Info disclosure |

### HIGH

| ID | Debt | Category | File | Impact |
|---|---|---|---|---|
| TD-SYS-09 | Zero tests (no framework, no files) | Quality | — | Regression risk |
| TD-SYS-10 | Mega components (5 files >900 LOC) | Maintainability | Various | Dev velocity |
| TD-SYS-11 | Code duplication (key maps x4, progress x3) | DRY | Various | Bug surface area |
| TD-SYS-12 | Unused deps: mysql2, nodemailer, bcryptjs | Dependencies | package.json | Bloat |
| TD-SYS-13 | Vite version conflict (v7 vs v6) | Dependencies | package.json | Build instability |

### MEDIUM

| ID | Debt | Category | File | Impact |
|---|---|---|---|---|
| TD-SYS-14 | Dead code: DeliveryModule, ActionPlanModule | Code health | modules/ | Confusion |
| TD-SYS-15 | No client-side routing | Architecture | App.tsx | No deep-links |
| TD-SYS-16 | Base path mismatch (vite vs html) | Config | vite.config.ts | Deploy bugs |
| TD-SYS-17 | Import map leftover from AI Studio | Build | index.html:70-83 | Confusion |
| TD-SYS-18 | Tailwind via CDN (no tree-shaking) | Performance | index.html:9 | ~300KB overhead |
| TD-SYS-19 | SQLite callback API (not promisified) | Code quality | routes/*.cjs | Callback hell |

### LOW

| ID | Debt | Category | File | Impact |
|---|---|---|---|---|
| TD-SYS-20 | No input validation library | Validation | routes/*.cjs | Data integrity |
| TD-SYS-21 | Inconsistent API client (fetch vs axios) | Consistency | Various | Maintainability |
| TD-SYS-22 | No TypeScript strict mode | Type safety | tsconfig.json | Bug prevention |
| TD-SYS-23 | No structured logging | Observability | server.cjs | Debugging |
| TD-SYS-24 | PM2 config references wrong file | DevOps | ecosystem.config.cjs | Deploy failure |
| TD-SYS-25 | package.json metadata incomplete | Metadata | package.json | Professionalism |

---

## 2. Database Debts (validated by @data-engineer)

⚠️ **PENDING: Full specialist review by @data-engineer**

### CRITICAL

| ID | Debt | File | Impact |
|---|---|---|---|
| TD-DB-01 | .env with plaintext secrets committed | .env | Full credential compromise |
| TD-DB-02 | JWT_SECRET uses hardcoded fallback | server.cjs:26 | Auth bypass (overlap TD-SYS-02) |

### HIGH

| ID | Debt | File | Impact |
|---|---|---|---|
| TD-DB-03 | pipeline.user_id lacks UNIQUE constraint | server.cjs:132 | Data duplication risk |
| TD-DB-04 | Indexes/triggers not created for fresh DBs | server.cjs:87-205 | Full table scans |
| TD-DB-05 | No pagination on admin endpoints | admin-users/pipeline.cjs | Memory exhaustion |
| TD-DB-06 | Admin password plaintext comparison | auth.cjs:217 | (overlap TD-SYS-01) |

### MEDIUM

| ID | Debt | File | Impact |
|---|---|---|---|
| TD-DB-07 | Denormalized email/name in diagnostic_data | server.cjs:109 | Stale data risk |
| TD-DB-08 | No schema version tracking | migrations/ | Migration safety |
| TD-DB-09 | expert_notes ALTER TABLE on every startup | server.cjs:157 | Fragile detection |
| TD-DB-10 | CORS fully open | server.cjs:49 | (overlap TD-SYS-04) |
| TD-DB-11 | No email format validation | auth.cjs | Invalid data |
| TD-DB-12 | Single SQLite, no pooling | server.cjs:72 | Lock contention |
| TD-DB-13 | No down-migrations/rollback scripts | migrations/ | Schema risk |
| TD-DB-14 | JSON.parse without try-catch | brand-brain.cjs | 500 errors |
| TD-DB-15 | No CHECK on question_id format | server.cjs:168 | Inconsistent data |

### LOW

| ID | Debt | File | Impact |
|---|---|---|---|
| TD-DB-16 | No updated_at on audio_recordings | server.cjs:163 | Audit gap |
| TD-DB-17 | uploaded_files.url never populated (dead) | server.cjs:190 | Schema bloat |
| TD-DB-18 | Composite status index underutilized | migrations/009 | Wasted maintenance |
| TD-DB-19 | Debug/test routes in production | health.cjs:17 | Info disclosure |

---

## 3. Frontend/UX Debts (validated by @ux-design-expert)

⚠️ **PENDING: Full specialist review by @ux-design-expert**

### CRITICAL

| ID | Debt | Impact |
|---|---|---|
| UX-01 | No CSS build pipeline (~300KB+ Tailwind CDN) | Performance |
| UX-02 | No routing library (no deep-links, no back/forward) | User experience |
| UX-03 | AdminPanel 1800+ line monolith | Maintainability |
| UX-04 | No React Error Boundary | Crash recovery |

### HIGH

| ID | Debt | Impact |
|---|---|---|
| UX-05 | Inconsistent design tokens (6+ raw hex backgrounds) | Theme changes |
| UX-06 | Two dead components (DeliveryModule, ActionPlanModule) | Dead weight |
| UX-07 | AudioRecorder ships despite feature hidden | Bundle size |
| UX-08 | Modal lacks focus trap + Escape key (WCAG violation) | Accessibility |
| UX-09 | Contrast failures (text-white/20-40 on dark) | Accessibility |
| UX-10 | Dashboard props dual shape | API confusion |

### MEDIUM

| ID | Debt | Impact |
|---|---|---|
| UX-11 | No semantic HTML landmarks | Screen readers |
| UX-12 | Wizard dots too small for touch (10px vs 44px) | Mobile usability |
| UX-13 | No focus management on transitions | Screen readers |
| UX-14 | AudioRecorder English text in PT app | Consistency |
| UX-15 | Import map leftover | Build confusion |
| UX-16 | Base path mismatch | Deploy issues |
| UX-17 | DOMPurify+marked duplicated | DRY |
| UX-18 | Legacy progress calc exported (unused) | Dead code |

### LOW

| ID | Debt | Impact |
|---|---|---|
| UX-19 | Logo loads external SVG | External dependency |
| UX-20 | Array index as AnimatePresence key | Animation bugs |
| UX-21 | Vite/plugin-react in deps and devDeps | Package hygiene |

---

## 4. Preliminary Prioritization Matrix

### Phase 1: Quick Wins (Week 1-2)

| Debt IDs | Action | Effort | Impact |
|---|---|---|---|
| TD-SYS-01/02/03/08, TD-DB-01/02/06 | Security hardening (bcrypt, JWT env, rotate creds) | 4-8h | CRITICAL |
| TD-SYS-04/06, TD-DB-10 | Add helmet + restrict CORS | 2h | CRITICAL |
| TD-SYS-05 | Add express-rate-limit | 2h | CRITICAL |
| TD-SYS-07 | Remove API key from frontend | 1h | CRITICAL |
| TD-SYS-12 | Remove unused deps | 1h | HIGH |
| TD-SYS-13 | Fix Vite version conflict | 1h | HIGH |
| TD-SYS-14 | Delete dead code files | 1h | MEDIUM |
| TD-SYS-24/25 | Fix PM2 config + package.json | 30min | LOW |
| UX-06 | Delete dead components | 30min | HIGH |
| TD-DB-19 | Remove/gate debug routes | 30min | LOW |

### Phase 2: Foundation (Week 3-6)

| Debt IDs | Action | Effort | Impact |
|---|---|---|---|
| UX-01 | Tailwind CSS build pipeline | 4-8h | CRITICAL |
| UX-02, TD-SYS-15 | Add React Router | 16-24h | CRITICAL |
| TD-SYS-09 | Test framework + initial tests | 24-40h | HIGH |
| TD-DB-03 | Add UNIQUE on pipeline.user_id | 4h | HIGH |
| TD-DB-04 | Move indexes/triggers into initializeDatabase() | 4h | HIGH |
| TD-DB-05 | Pagination on admin endpoints | 8h | HIGH |
| UX-04 | Add React Error Boundary | 4h | CRITICAL |
| UX-08 | Fix Modal accessibility | 4h | HIGH |

### Phase 3: Optimization (Week 7-12)

| Debt IDs | Action | Effort | Impact |
|---|---|---|---|
| TD-SYS-10, UX-03 | Decompose mega components | 40-60h | HIGH |
| TD-SYS-11 | Extract shared constants/utils | 8-12h | HIGH |
| UX-05 | Consolidate design tokens | 8-12h | HIGH |
| TD-SYS-19 | Promisify SQLite or switch to better-sqlite3 | 16-24h | MEDIUM |
| UX-09 | Fix contrast throughout | 8h | HIGH |
| UX-11 | Add semantic HTML | 8h | MEDIUM |
| TD-SYS-22 | Enable TypeScript strict mode | 16-24h | MEDIUM |

---

## 5. Questions for Specialists

### For @data-engineer:
1. Is the current single-file SQLite approach sustainable for the expected user scale (100? 1000? 10000 users)?
2. Should we migrate to PostgreSQL/Supabase for production, or is SQLite sufficient with WAL mode?
3. The denormalized email/name in diagnostic_data — should we remove it now or after adding proper join queries?
4. What's the recommended approach for schema version tracking in SQLite?

### For @ux-design-expert:
1. The 6+ different dark background hex values — should we standardize to the 3 existing tokens (navy-light/navy/navy-dark)?
2. For the routing solution — should we use React Router with hash routing (simpler) or history routing (cleaner URLs)?
3. The AdminPanel monolith — what's the recommended decomposition? By feature (users/pipeline/bb/assets) or by concern (list/detail/actions)?
4. For the Modal accessibility fix — should we adopt @radix-ui/react-dialog or implement focus trap manually?

---

## 6. Cross-Area Dependencies

| Debt | Depends On | Blocks |
|---|---|---|
| React Router (UX-02) | — | Deep-linking for admin, BB, assets |
| Tailwind build (UX-01) | — | Design token consolidation (UX-05) |
| Test framework (TD-SYS-09) | — | All future refactoring confidence |
| Component decomposition (TD-SYS-10) | React Router, Tests | Maintainable features |
| Security hardening (TD-SYS-01-08) | — | Production readiness |
| SQLite promisification (TD-SYS-19) | — | Cleaner backend code |

---

## Appendix: Source Documents

- Phase 1: `docs/architecture/system-architecture.md`
- Phase 2: `docs/database/SCHEMA.md` + `docs/database/DB-AUDIT.md`
- Phase 3: `docs/frontend/frontend-spec.md`

---

*Draft generated by @architect (Aria) — Phases 5-7 specialist reviews pending*
