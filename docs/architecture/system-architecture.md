# System Architecture — Prosperus Mentoria Platform

**Phase 1: Brownfield Discovery**
**Agent:** @architect (Aria)
**Date:** 2026-02-28

---

## 1. Executive Summary

Prosperus Mentoria is a full-stack web application for mentor diagnostics and brand building. It uses React 19 + TypeScript + Vite on the frontend, Express 5 + SQLite on the backend, and integrates with HubSpot CRM, Google Gemini AI, and n8n webhooks.

The platform enables mentors to complete a 5-module diagnostic questionnaire, after which an automated pipeline generates research dossiers, brand brain documents, and marketing assets.

---

## 2. Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 19.2.1 | UI framework |
| TypeScript | ~5.8.2 | Type safety (loose config) |
| Vite | 7.2.7 / 6.2.0 (CONFLICT) | Build tool |
| framer-motion | 12.23.25 | Animations |
| marked | 17.0.3 | Markdown rendering |
| DOMPurify | 3.3.1 | XSS sanitization |
| html2pdf.js | 0.14.0 | Client-side PDF |
| axios | 1.13.2 | HTTP client |
| Tailwind CSS | CDN (no npm) | Utility CSS |
| Bootstrap Icons | 1.11.3 CDN | Icons (partial usage) |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Express | 5.2.1 | HTTP server |
| SQLite3 | 5.1.7 | Database |
| jsonwebtoken | 9.0.3 | JWT auth |
| multer | 2.0.2 | File uploads |
| @google/genai | 1.31.0 | Gemini AI transcription |
| cors | 2.8.5 | CORS middleware |
| dotenv | 17.2.3 | Environment config |
| uuid | 13.0.0 | ID generation |

### Unused Dependencies (Dead Weight)

| Dependency | Version | Status |
|---|---|---|
| mysql2 | 3.15.3 | Never imported — app uses SQLite |
| nodemailer | 7.0.11 | Never imported anywhere |
| bcryptjs | 3.0.3 | Never imported (SHOULD be used for password hashing) |

---

## 3. Folder Structure

```
mentoria-main/
├── App.tsx                      # Root component, auth routing
├── index.tsx                    # React entry point
├── index.html                   # HTML shell (CDN Tailwind, importmap)
├── server.cjs                   # Express server (CommonJS)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── ecosystem.config.cjs         # PM2 process management
├── components/
│   ├── AdminPanel.tsx           # Admin dashboard (1519 LOC — monolith)
│   ├── Dashboard.tsx            # Member dashboard + sidebar (601 LOC)
│   ├── Header.tsx               # Landing page header
│   ├── Hero.tsx                 # Landing hero section
│   ├── Footer.tsx               # Landing footer
│   ├── GoalSection.tsx          # Landing goal section
│   ├── ImportantInfo.tsx        # Landing info section
│   ├── LoginModal.tsx           # Auth modal (member/admin)
│   ├── ModulesOverview.tsx      # Landing modules overview
│   ├── OverviewPanel.tsx        # Dashboard overview (431 LOC)
│   ├── brand-brain/
│   │   └── BrandBrainViewer.tsx # Brand Brain viewer/editor (2037 LOC — monolith)
│   ├── modules/
│   │   ├── PreModule.tsx        # Pre-module data collection
│   │   ├── MentorModule.tsx     # Module 1: Mentor profile
│   │   ├── MenteeModule.tsx     # Module 2: Mentee/ICP
│   │   ├── MethodModule.tsx     # Module 3: Method/Framework
│   │   ├── OfferModule.tsx      # Module 4: Offer builder
│   │   ├── DeliveryModule.tsx   # DEAD CODE — not imported
│   │   └── ActionPlanModule.tsx # DEAD CODE — stale data shape
│   ├── assets/
│   │   ├── AssetDeliveryHub.tsx # Assets main hub
│   │   ├── AssetViewer.tsx      # Individual asset viewer
│   │   ├── AssetArrivalScreen.tsx
│   │   ├── ChatScriptViewer.tsx
│   │   ├── CadenceTimeline.tsx
│   │   ├── LandingPagePreview.tsx
│   │   ├── OutreachFlowView.tsx
│   │   ├── TeleprompterStageMap.tsx
│   │   ├── ToolkitGuide.tsx
│   │   ├── assetConfig.ts
│   │   ├── shared.tsx
│   │   └── useInlineEdit.ts
│   ├── shared/
│   │   ├── AccordionSection.tsx
│   │   ├── AudioRecorder.tsx    # Audio recording (456 LOC, feature hidden)
│   │   ├── CelebrationOverlay.tsx
│   │   ├── FileUpload.tsx
│   │   ├── PodiumInput.tsx
│   │   ├── SectionWarning.tsx
│   │   ├── StepTransition.tsx
│   │   ├── TagInput.tsx
│   │   ├── TextOrAudioInput.tsx
│   │   └── VSCompare.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Logo.tsx
│       └── Modal.tsx
├── routes/
│   ├── health.cjs
│   ├── auth.cjs
│   ├── diagnostic.cjs
│   ├── user-progress.cjs
│   ├── brand-brain.cjs
│   ├── assets.cjs
│   ├── admin-users.cjs
│   ├── admin-pipeline.cjs
│   ├── files.cjs
│   └── audio.cjs
├── hooks/
│   └── useDiagnosticPersistence.ts
├── utils/
│   └── progress.ts
├── types/
│   ├── diagnostic.ts
│   ├── pipeline.ts
│   └── audio.ts
├── data/
│   ├── prosperus.db
│   ├── audio/
│   └── uploads/
├── migrations/
│   ├── 001-011 SQL files
│   ├── run-migration.cjs
│   └── run-all.sh
├── scripts/
│   ├── inspect_progress.js
│   ├── inspect_user.js
│   └── verify_admin.js
└── dist/                        # Vite build output
```

---

## 4. Architecture Diagram

```
                        [Browser]
                           |
              Tailwind CDN + Bootstrap Icons CDN
                           |
                     [index.html]
                           |
                     [index.tsx]
                           |
                      [App.tsx]
                    /     |      \
            [Landing]  [Dashboard]  [AdminPanel]
                        /    \          |
              [Modules]  [BB/Assets]   [All admin views]
                  |          |              |
             [useDiagnosticPersistence]     |
                  |          |              |
                  +--[axios]--+--[axios]----+
                           |
                     [Vite Proxy / Express]
                           |
                      [server.cjs]
                    /      |       \
            [routes/*.cjs] [static] [SPA fallback]
                  |
            [sqlite3 DB] ---- data/prosperus.db
                  |
         [data/audio/] [data/uploads/]
                  |
      +-------+------+-------+
      |       |      |       |
   HubSpot  Gemini  n8n    Local FS
```

---

## 5. Code Patterns

### 5.1 State Management

- No centralized state library (no Redux, Zustand)
- React useState/useEffect throughout
- Single custom hook `useDiagnosticPersistence` manages all diagnostic data + auto-save (1s debounce)
- Auth state in App.tsx via local useState
- Token persisted to localStorage (`memberToken`)
- All state passed via prop drilling — no Context providers

### 5.2 Routing

- NO client-side router (no react-router)
- Navigation via conditional rendering in App.tsx + state variables
- No deep-linking, no bookmarks, no browser back/forward
- Page refresh loses position (admin loses session entirely)

### 5.3 API Communication

- Mix of axios and native fetch (LoginModal uses fetch, rest uses axios)
- No API client abstraction — direct axios calls in every component
- Auth token attached manually per-request
- No interceptors for token management or error handling
- URLs are hardcoded relative paths

### 5.4 Component Structure

- Massive monolith components: BrandBrainViewer (2037 LOC), AdminPanel (1519 LOC)
- Shared components exist but are underutilized
- Inline Tailwind classes (CDN mode)
- Type definitions duplicated across components

### 5.5 Error Handling

- Backend: try/catch at route level + global error handler
- Frontend: inconsistent — some catch, some don't
- No React Error Boundary
- No offline detection or network error handling

### 5.6 Auth Pattern

- Member: email verified against HubSpot CRM (deal stage check)
- Admin: plaintext password comparison (bcryptjs installed but unused)
- JWT tokens expire in 24h, no refresh mechanism
- Hardcoded JWT secret fallback: `'prosperus-secret-key-2024'`

---

## 6. Integration Points

| Service | Protocol | Purpose | Auth |
|---|---|---|---|
| HubSpot CRM | REST API | Member verification via deal stage | Bearer token |
| Google Gemini | SDK | Audio transcription (server-side) | API key |
| n8n Webhook | HTTP POST | Diagnostic submission notification | None |
| Local FS | Direct | Audio/file storage | N/A |

---

## 7. Configuration

### Environment Variables (.env)

| Variable | Default | Purpose |
|---|---|---|
| PORT | 3005 | Server port |
| HUBSPOT_PRIVATE_TOKEN | (none) | HubSpot API auth |
| JWT_SECRET | 'prosperus-secret-key-2024' | **INSECURE FALLBACK** |
| ADMIN_PASSWORD | (none, required) | Admin login |
| GEMINI_APIKEY | (none) | Backend AI |
| API_KEY | (none) | Frontend AI (exposed in bundle) |

### Build Config

- Vite base path: `/mentoria/`
- HTML base tag: `/prosperus-mentor-diagnosis/` — **MISMATCH**
- Output: `dist/`

### Deploy

- PM2 via ecosystem.config.cjs
- **BROKEN**: references `./server/index.js` but actual file is `server.cjs`
- Contains hardcoded `ADMIN_PASSWORD: 'admin123'`

---

## 8. Technical Debts Identified

### CRITICAL (Security)

| ID | Description | File |
|---|---|---|
| TD-SYS-01 | Plaintext admin password comparison (bcryptjs unused) | auth.cjs:217 |
| TD-SYS-02 | Hardcoded JWT secret fallback | server.cjs:26 |
| TD-SYS-03 | Hardcoded credentials in ecosystem.config.cjs | ecosystem.config.cjs:15 |
| TD-SYS-04 | Wide-open CORS (origin: '*') | server.cjs:49 |
| TD-SYS-05 | No rate limiting on any endpoint | server.cjs |
| TD-SYS-06 | No security headers (no helmet) | server.cjs |
| TD-SYS-07 | Gemini API key exposed to frontend bundle | vite.config.ts:15 |
| TD-SYS-08 | Debug logging of sensitive info in auth | auth.cjs:209-210 |

### HIGH

| ID | Description | File |
|---|---|---|
| TD-SYS-09 | No tests whatsoever (0 test files, no framework) | — |
| TD-SYS-10 | Mega components (5 files >900 LOC) | Various |
| TD-SYS-11 | Code duplication (SECTION_KEY_MAP x4, progress calc x3) | Various |
| TD-SYS-12 | Unused deps: mysql2, nodemailer, bcryptjs | package.json |
| TD-SYS-13 | Vite version conflict (v7 vs v6) | package.json |

### MEDIUM

| ID | Description | File |
|---|---|---|
| TD-SYS-14 | Dead code: DeliveryModule, ActionPlanModule | modules/ |
| TD-SYS-15 | No client-side routing | App.tsx |
| TD-SYS-16 | Base path mismatch (vite vs html) | vite.config.ts, index.html |
| TD-SYS-17 | Import map leftover from AI Studio | index.html:70-83 |
| TD-SYS-18 | Tailwind via CDN (no tree-shaking) | index.html:9 |
| TD-SYS-19 | SQLite callback API (not promisified) | routes/*.cjs |

### LOW

| ID | Description | File |
|---|---|---|
| TD-SYS-20 | No input validation library | routes/*.cjs |
| TD-SYS-21 | Inconsistent API client (fetch vs axios) | Various |
| TD-SYS-22 | No TypeScript strict mode | tsconfig.json |
| TD-SYS-23 | No structured logging | server.cjs |
| TD-SYS-24 | PM2 config references wrong file | ecosystem.config.cjs |
| TD-SYS-25 | package.json metadata incomplete | package.json |
