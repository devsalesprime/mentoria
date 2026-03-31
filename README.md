# Prosperus Club — Mentor Diagnosis & Deliverables Platform

> **Business context:** This is the core product of Prosperus Club / Sales Prime. It guides high-ticket mentors through a structured diagnostic, then uses an AI squad pipeline to generate R$26,500+ worth of strategic deliverables — Brand Brain, sales scripts, landing page copy, outreach sequences, VSL scripts, and follow-up cadences. The platform replaces weeks of agency work with an AI-orchestrated process that runs in days.

---

## What This System Does (End-to-End)

1. **Mentor completes a 5-module diagnostic** (interactive app, auto-saves per field)
2. **AI Squad 1** extracts a Master Context + tailored Research Prompt from the diagnostic
3. **Google Gemini Deep Research** runs market/competitive research using the prompt
4. **AI Squad 2** generates a Brand Brain (5-section strategic document) + Validation Summary + Expert Notes
5. **Mentor reviews & approves** the Validation Summary (5-10 min, not the full BB)
6. **AI Squad 3** uses the Brand Brain to generate 6 deliverable assets
7. **Assets appear in the mentor's dashboard**, organized by phase (Attract / Connect / Convert)

See `Full-process.md` (parent directory) for the complete pipeline with mermaid diagrams, model assignments, and quality gates.

---

## Architecture & Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React 19, TypeScript, Vite 7 | SPA with route-based code splitting |
| **Styling** | Tailwind CSS v4 | Custom design tokens (gold/navy palette), dark mode native |
| **Animations** | Framer Motion | Page transitions, drag-and-drop, modals |
| **Backend** | Node.js, Express 5 | CommonJS routes, modular route files |
| **Database** | SQLite 3 (WAL mode) | Schema v2.1 with FK constraints, triggers, indexes |
| **Auth** | JWT + HubSpot CRM validation | Members validated via HubSpot deal stage (`closedwon`) |
| **AI (Diagnostic)** | Google Gemini API (`@google/genai`) | Real-time pitch validation + action plan generation |
| **AI (Pipeline)** | Claude Opus/Sonnet/Haiku squads | 3 squads, 24+ agents, orchestrated via AIOS framework |
| **Security** | Helmet, CORS whitelist, rate limiting, Zod validation | See security section below |
| **Process Manager** | PM2 | Production on Hostinger VPS |
| **Icons** | Bootstrap Icons | |

---

## Project Structure

```
mentoria-main/
├── server.cjs                  # Express server (v1.2.0), DB init, route mounting
├── App.tsx                     # React router: Landing, Login, Dashboard, Admin, Brand Brain, Assets
├── components/
│   ├── modules/                # 7 diagnostic modules (PreModule → Offer)
│   │   ├── PreModule.tsx       #   Materials, profiles, competitors
│   │   ├── MentorModule.tsx    #   Expertise, authority, testimonials, positioning
│   │   ├── MenteeModule.tsx    #   ICP: success interview (Hormozi journey) or deep-dive flow
│   │   ├── MethodModule.tsx    #   Pillars, obstacles, transformation journey
│   │   ├── OfferModule.tsx     #   Deliverables, pricing, bonuses
│   │   ├── DeliveryModule.tsx  #   Delivery logistics
│   │   └── ActionPlanModule.tsx#   AI-generated diagnostic summary
│   ├── brand-brain/            # Brand Brain viewer (5-section, inline editing, expert notes)
│   │   ├── BrandBrainViewer.tsx
│   │   ├── BrandBrainSection.tsx
│   │   ├── SubsectionCard.tsx  #   Masonry layout, table editor, mobile touch controls
│   │   ├── BBPillarIntro.tsx   #   4-pillar educational header (dismissible)
│   │   └── BBExportUtils.ts
│   ├── assets/                 # 5 specialized asset viewers + hub
│   │   ├── AssetDeliveryHub.tsx#   Phase-based navigation (Attract/Connect/Convert)
│   │   ├── ChatScriptViewer.tsx#   Sales script — chat bubbles, 7 stages
│   │   ├── OutreachFlowView.tsx#   Outreach — dual-tab (IDAC script + blueprint)
│   │   ├── CadenceTimeline.tsx #   Follow-up — vertical timeline, day/channel detection
│   │   ├── LandingPagePreview.tsx# LP copy — 11 sections (A-K), alphabet nav
│   │   ├── TeleprompterStageMap.tsx# VSL — 12 stages, auto-scroll teleprompter
│   │   ├── assetConfig.ts      #   ASSET_CATALOG, phases, paradigm mapping
│   │   └── shared.tsx          #   Copy, PDF, markdown export utilities
│   ├── admin/                  # Admin panel (decomposed from 1519-line monolith)
│   │   ├── AdminUserList.tsx
│   │   ├── AdminUserDetail.tsx
│   │   ├── PipelineOverview.tsx
│   │   ├── PipelineDetailView.tsx  # Markdown textareas, research link, expert notes
│   │   └── StatusBadge.tsx / Toast.tsx / helpers.ts
│   ├── routing/                # Auth guards, landing page, login, 404
│   ├── shared/                 # Reusable: ErrorBoundary, AudioRecorder, FileUpload, etc.
│   ├── ui/                     # Design system: Button (9 variants), Card, FormField, LoadingSpinner
│   └── Dashboard.tsx           # Main member dashboard (4-pillar progress, sidebar nav)
├── routes/                     # Express route modules (all .cjs)
│   ├── auth.cjs                #   HubSpot validation + JWT + admin login (bcrypt)
│   ├── diagnostic.cjs          #   Module save/load, submit, webhook trigger
│   ├── brand-brain.cjs         #   BB sections CRUD, inline editing, approval flow
│   ├── admin-pipeline.cjs      #   Pipeline management, BB upload, expert notes, research
│   ├── admin-users.cjs         #   User CRUD, legacy tagging
│   ├── assets.cjs              #   Asset storage/retrieval
│   ├── files.cjs               #   File upload (multer)
│   ├── audio.cjs               #   Audio recording storage
│   ├── user-progress.cjs       #   Progress tracking
│   ├── health.cjs              #   Health check endpoint
│   └── shared/                 #   brand-brain-constants.cjs (shared between routes)
├── utils/
│   ├── db-helpers.cjs          # Promisified dbGet/dbRun/dbAll wrappers
│   ├── validation.cjs          # Zod schemas + validateBody middleware
│   ├── brand-brain-constants.ts# Frontend BB constants (VALID_SECTIONS, SECTION_KEY_MAP)
│   ├── brand-brain-parser.ts   # H4 parser, cluster detection, suggestion groups, table parsing
│   ├── markdown.ts             # Markdown rendering utilities
│   └── progress.ts             # Progress calculation helpers
├── hooks/
│   └── useAdminUsers.ts        # Admin user CRUD hook
├── types/
│   └── admin.ts                # Admin panel TypeScript interfaces
├── styles/
│   └── globals.css             # Tailwind v4 config, design tokens, custom utilities
├── tests/                      # Vitest suite (80+ tests)
├── migrations/                 # 13 SQL migrations (001-013)
├── data/                       # SQLite DB + uploads + audio (gitignored)
├── dist/                       # Vite build output (served by Express in production)
├── ecosystem.config.cjs        # PM2 config for VPS
└── vite.config.ts / tsconfig.json / tailwind.config.ts
```

---

## Database Schema (v2.1)

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `users` | Member & admin accounts | email (unique), role (member/admin) |
| `diagnostic_data` | 5-module diagnostic responses | user_id (FK, unique), pre_module/mentor/mentee/method/offer (JSON), progress_percentage, status |
| `pipeline` | AI pipeline state per user | user_id (FK, unique), research_dossier, brand_brain, assets (all JSON), status fields per stage, expert_notes, educational_suggestions |
| `bb_analytics` | Mentor engagement tracking | event_type (bb_full_viewed, expert_notes_viewed, bb_full_download) |
| `audio_recordings` | Voice recordings per question | user_id, module, question_id, file_path, transcript |
| `uploaded_files` | File uploads (testimonials, materials) | user_id, category, file_path |
| `schema_migrations` | Migration version tracking | version, applied_at, description |

All tables have FK constraints, CHECK constraints, auto-update triggers, and performance indexes.

---

## Diagnostic Modules (What the Mentor Fills Out)

### Pre-Module
Materials, social media profiles, content links, competitor list.

### Module 1: O Mentor (Identity & Authority)
Pitch (AI-validated), career timeline, top 3 results (Gold/Silver/Bronze), mission/vision/values, team structure, testimonials, market differentiation.

### Module 2: O Mentorado (Target Audience)
Two flows based on experience:
- **"I have clients" flow:** Persona radar (drag-and-drop), Fan vs Hater map, community definition
- **"I don't have clients" flow:** Demographics wizard, Before/After transformation, Decision Mountain, consumption journey, Bullseye targeting

### Module 3: O Metodo (Delivery Process)
Maturity selection (in head / structured), method name + unique promise, 3-8 pillars, obstacles per pillar, A→B journey mapping.

### Module 4: A Oferta (Product & Pricing)
Offer identity, deliverables list, bonuses, pricing, engagement rituals, community rules, overdelivery definition.

### Action Plan
AI cross-references all modules → generates: Sale Score, Strengths, Blind Spots, Tactical Plan.

---

## User Flows

### Member Flow
```
Landing Page → Login (HubSpot email validation) → Dashboard
  → Complete modules sequentially (auto-save per field)
  → Submit diagnostic → webhook fires → pipeline begins
  → Brand Brain appears (Validation Summary for review)
  → Approve → Assets generated → Delivered in 3 phases
```

### Admin Flow
```
/admin login (bcrypt) → User list → Pipeline management
  → Upload research dossier, brand brain, assets (markdown)
  → Set expert notes per section
  → Track pipeline status per user
  → View analytics (BB engagement, asset delivery)
```

---

## Security

- **JWT_SECRET** required via env (no hardcoded fallback, exits on missing)
- **Helmet** security headers with CSP directives
- **CORS** restricted to whitelist (`ALLOWED_ORIGINS` env var)
- **Rate limiting**: 5 req/min on login, 100 req/min on API
- **Zod validation** on all POST/PUT bodies
- **Promisified DB** with parameterized queries (no SQL injection)
- **Error boundaries** on all React routes
- **Auth guards** on all protected routes (member + admin separation)

---

## Environment Variables

```env
# Required
PORT=3005
JWT_SECRET=<strong-random-secret>
HUBSPOT_PRIVATE_TOKEN=<hubspot-private-app-token>
HUBSPOT_WIN_STAGE=closedwon
ADMIN_PASSWORD_HASH=<bcrypt-hash>

# Optional
ALLOWED_ORIGINS=https://prosperusclub.com.br,http://localhost:3005
VITE_API_KEY=<google-gemini-api-key>
```

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Start Vite dev server (localhost:5173) |
| `npm start` | Start Express production server |
| `npm run build` | Build frontend to `dist/` |
| `npm test` | Run Vitest test suite |
| `npm run test:watch` | Watch mode tests |
| `npm run test:coverage` | Coverage report |

---

## Deployment (Hostinger VPS)

- **URL:** `https://prosperusclub.com.br/prosperus-mentor-diagnosis/`
- **Path:** `/var/www/prosperus-mentor-diagnosis/`
- **Process:** PM2 (`ecosystem.config.cjs`)
- **Repo:** `https://github.com/devsalesprime/mentoria.git`

```bash
# Deploy (run commands one at a time on VPS)
cd /var/www/prosperus-mentor-diagnosis
git pull origin main
npm run build        # only if frontend changed
pm2 restart all
```

Database (`data/prosperus.db`) is gitignored — never overwritten by deploy.

---

## AI Squad Pipeline (External)

The diagnostic data feeds into 3 AI squads orchestrated via the AIOS framework (separate from this app codebase). The squads live in `../squads/`:

| Squad | Input | Output | Value |
|-------|-------|--------|-------|
| **research-prompt-gen** | Raw diagnostic | Master Context + Research Prompt | — |
| **brand-brain-gen** | MC + Diagnostic + Research Dossier | Brand Brain + Validation Summary + Expert Notes | — |
| **asset-gen** | Brand Brain | 6 deliverable assets | R$26,500 |

See `../Full-process.md` for the complete pipeline specification.

---

## Design System

- **Palette:** Navy/gold dark theme with 8 standardized white opacity levels
- **Custom tokens:** `email`, `medal-gold`, `medal-silver`, `medal-bronze`
- **Components:** Button (9 variants, 5 sizes), Card (3 variants), FormField, LoadingSpinner
- **Typography:** Minimum `text-sm` for accessibility (130 `text-xs` instances migrated)
- **All hex colors eliminated** — using Tailwind tokens exclusively

---

*Prosperus Club — Sales Prime | Updated 2026-03-16*
