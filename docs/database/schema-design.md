# Database Schema Design — Prosperus Mentor Diagnosis

> **Version:** 2.0.0
> **Date:** 2026-02-25
> **Author:** Dara (Data Engineer Agent)
> **Engine:** SQLite 3 (file-based)
> **Status:** Proposed — Optimization of existing v1.x schema

---

## 1. Schema Overview

### Purpose & Scope

This document defines the optimized database schema for **Prosperus Mentor Diagnosis**, a platform where mentors complete a structured 5-module diagnostic and receive AI-generated Brand Brain documents and sales asset packs.

### Target System

| Property | Value |
|----------|-------|
| Database Engine | SQLite 3 (via `sqlite3` npm v5.1.7) |
| File Location | `./data/prosperus.db` |
| Connection Mode | Single file, synchronous |
| WAL Mode | Recommended (enables concurrent reads) |

### Key Business Entities

| Entity | Description |
|--------|-------------|
| **User** | A mentor authenticated via HubSpot deal verification |
| **Diagnostic** | 5-module questionnaire data (pre_module, mentor, mentee, method, offer) |
| **Pipeline** | Admin-driven AI processing stages (research, brand_brain, review, assets) |
| **Audio Recording** | Voice answers recorded per module question |
| **Uploaded File** | Documents and materials uploaded by mentors |

### Expected Scale

| Metric | Estimate |
|--------|----------|
| Active users | 10–50 mentors |
| Records per user | ~1 diagnostic + 1 pipeline + 5–20 audio + 5–15 files |
| Total DB size | < 10 MB |
| Concurrency | 1–5 simultaneous users |
| Growth rate | ~5–10 users/month |

### Key Changes from v1.x

| Change | Rationale |
|--------|-----------|
| Remove `user_progress` table | Replaced by `diagnostic_data` — redundant legacy table |
| Remove `tasks` table | Unused in codebase — no active references |
| Remove `submissions` table | Redundant with diagnostic submit flow |
| Add foreign key constraints | Enforce referential integrity at DB level |
| Add indexes on `user_id` columns | All lookups are user-scoped |
| Add `updated_at` to all tables | Consistent audit trail |
| Add CHECK constraints on status fields | Prevent invalid state transitions |
| Enable WAL mode | Better concurrent read performance |

---

## 2. Domain Model

### Core Entities

#### User
The authenticated mentor who interacts with the platform. Created on first HubSpot-verified login.

**Lifecycle:** Created on login → Active while using platform → Can be deleted by admin (cascading)

**Key attributes:**
- Email (unique, from HubSpot)
- Name (from HubSpot contact)
- Role (`member` or `admin`)

#### Diagnostic Data
The 5-module questionnaire that each mentor completes. Each module captures structured data as JSON:

| Module | Purpose | Data Shape |
|--------|---------|------------|
| `pre_module` | Existing materials, profiles, competitors | Links, files, social profiles |
| `mentor` | Identity, authority, achievements, differentiation | Text/audio answers across 5 steps |
| `mentee` | Ideal client profile (Hormozi 6-step matrix) | Before/Decision/After pairs |
| `method` | Methodology structure (pillars or steps) | Pillars/steps with obstacles |
| `offer` | Commercial offer details | Deliverables, bonuses, pricing |

**Lifecycle:** `in_progress` → `submitted` (irreversible once admin processes)

**Design Decision — JSON Columns:** Module data is stored as JSON blobs because:
1. Each module has deeply nested, variable-structure data (arrays of testimonials, pillars with sub-objects, obstacle pairs)
2. The application reads/writes entire modules at once (never queries individual fields)
3. At 10–50 users, normalization into 15+ join tables adds complexity without measurable benefit
4. SQLite JSON functions are available if field-level queries are ever needed

#### Pipeline
Admin-controlled AI processing stages that transform diagnostic data into deliverables.

**Lifecycle:** `diagnostic` → `research` → `brand_brain` → `review` → `assets` → `delivered`

**Key data:**
- Research dossier (AI-generated market research)
- Brand Brain (AI-generated brand strategy document with 4 sections)
- Section approvals (per-section mentor review status)
- Assets (generated sales materials pack)

**Design Decision — JSON for AI outputs:** Research dossier, Brand Brain, and Assets are large AI-generated documents. They are always read/written as complete units and their internal structure changes as the AI models evolve. JSON storage is correct here.

#### Audio Recording
Voice-recorded answers tied to specific module questions.

**Key attributes:**
- Module + question_id (locates the exact question)
- File path (physical .webm/.wav file on disk)
- Transcript (AI-generated text from audio)
- Duration in seconds

#### Uploaded File
Documents and materials uploaded by mentors during the diagnostic.

**Key attributes:**
- Category + module (organize files by context)
- Physical file metadata (name, path, type, size)
- URL (for serving back to client)

### Relationships

```
users (1) ──────── (0..1) diagnostic_data
  │                         │
  │                         └── user_id FK
  │
  ├──── (0..1) pipeline
  │               └── user_id FK
  │
  ├──── (0..N) audio_recordings
  │               └── user_id FK
  │
  └──── (0..N) uploaded_files
                  └── user_id FK
```

All relationships are **one-to-many from users**, with user_id as the foreign key. The diagnostic_data has a UNIQUE constraint on user_id (one diagnostic per user).

### Cascade Behavior

| Relationship | ON DELETE |
|-------------|-----------|
| users → diagnostic_data | CASCADE |
| users → pipeline | CASCADE |
| users → audio_recordings | CASCADE |
| users → uploaded_files | CASCADE |

When a user is deleted, all their data is automatically removed. This matches the existing manual cascade in the delete endpoint and makes it atomic.

---

## 3. Access Patterns & Query Requirements

### Primary Access Patterns (High Frequency)

| # | Pattern | Frequency | Tables | Query |
|---|---------|-----------|--------|-------|
| P1 | Load user diagnostic data | Every page load | `diagnostic_data` | `WHERE user_id = ?` |
| P2 | Save diagnostic progress | Every 1s (debounced) | `diagnostic_data` | `UPDATE WHERE user_id = ?` |
| P3 | Load pipeline status | Polling every 60s | `pipeline` | `WHERE user_id = ?` |
| P4 | List audio recordings | On module load | `audio_recordings` | `WHERE user_id = ? AND module = ?` |
| P5 | List uploaded files | On module load | `uploaded_files` | `WHERE user_id = ?` |

### Secondary Access Patterns (Admin)

| # | Pattern | Frequency | Tables | Query |
|---|---------|-----------|--------|-------|
| S1 | List all users with pipeline status | Admin dashboard load | `diagnostic_data` JOIN `users` JOIN `pipeline` | 3-table LEFT JOIN |
| S2 | Get user details with diagnostic | Admin user view | `diagnostic_data` JOIN `users` | `WHERE dd.id = ?` |
| S3 | Download user report | On-demand | `diagnostic_data` + `audio_recordings` | User data + audio transcripts |
| S4 | Delete user cascade | Rare | All tables | Transaction with cascading deletes |
| S5 | Pipeline overview | Admin pipeline view | `diagnostic_data` JOIN `pipeline` | LEFT JOIN ordered by last_updated |

### Write Patterns

| Pattern | Frequency | Notes |
|---------|-----------|-------|
| Diagnostic save | High (1s debounce) | INSERT OR REPLACE on single row |
| Pipeline stage updates | Low (admin-triggered) | UPDATE single row per stage |
| Audio upload | Medium (during diagnostic) | INSERT new row + file write |
| File upload | Medium (during diagnostic) | INSERT new row + file write |

---

## 4. Physical Schema Design

### Initialization

```sql
-- Enable WAL mode for better concurrent read performance
PRAGMA journal_mode = WAL;

-- Enable foreign key enforcement (SQLite default is OFF)
PRAGMA foreign_keys = ON;
```

### Table: `users`

**Purpose:** Authenticated platform users (mentors and admin)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique user ID (`user-{timestamp}-{random}` or `admin-001`) |
| `email` | TEXT | UNIQUE NOT NULL | Email address (from HubSpot) |
| `name` | TEXT | | Full name (from HubSpot contact) |
| `role` | TEXT | NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin')) | User role |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Account creation time |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Last profile update |

**Indexes:**
- `idx_users_email` UNIQUE on (`email`) — Login lookup (auto-created by UNIQUE constraint)

---

### Table: `diagnostic_data`

**Purpose:** 5-module diagnostic questionnaire data per mentor

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Diagnostic record ID |
| `user_id` | TEXT | UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE | Owner (one diagnostic per user) |
| `email` | TEXT | NOT NULL | Denormalized for quick access in reports |
| `name` | TEXT | | Denormalized for quick access in reports |
| `pre_module` | JSON | | Pre-module data (materials, profiles, competitors) |
| `mentor` | JSON | | Module 1: Mentor identity and authority |
| `mentee` | JSON | | Module 2: Ideal client profile (Hormozi 6-step) |
| `method` | JSON | | Module 3: Methodology structure |
| `offer` | JSON | | Module 4: Commercial offer |
| `current_module` | TEXT | DEFAULT 'pre_module' CHECK(current_module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')) | Active module |
| `current_step` | INTEGER | DEFAULT 0 | Active step within module |
| `progress_percentage` | INTEGER | DEFAULT 0 CHECK(progress_percentage BETWEEN 0 AND 100) | Overall completion % |
| `status` | TEXT | NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'submitted')) | Diagnostic status |
| `submitted_at` | DATETIME | | When diagnostic was submitted |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Record creation |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Last modification |

**Indexes:**
- `idx_diagnostic_user_id` UNIQUE on (`user_id`) — All lookups are by user_id (auto-created by UNIQUE constraint)
- `idx_diagnostic_status` on (`status`) — Admin filtering by status

**Denormalization Notes:**
- `email` and `name` are duplicated from `users` to avoid JOINs on the most frequent read path (diagnostic load). Acceptable trade-off: these fields rarely change and the table has < 100 rows.

---

### Table: `pipeline`

**Purpose:** Admin-controlled AI processing stages (research → brand brain → review → assets)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Pipeline record ID (UUID) |
| `user_id` | TEXT | NOT NULL REFERENCES users(id) ON DELETE CASCADE | Owner mentor |
| `research_dossier` | JSON | | AI-generated market research |
| `research_status` | TEXT | DEFAULT 'pending' CHECK(research_status IN ('pending', 'in_progress', 'complete')) | Research stage status |
| `research_completed_at` | DATETIME | | When research was completed |
| `brand_brain` | JSON | | AI-generated brand strategy (4 sections) |
| `brand_brain_status` | TEXT | DEFAULT 'pending' CHECK(brand_brain_status IN ('pending', 'generated', 'danilo_review', 'mentor_review', 'approved')) | Brand brain stage status |
| `brand_brain_version` | INTEGER | DEFAULT 0 | Brand brain revision count |
| `brand_brain_completed_at` | DATETIME | | When brand brain was finalized |
| `section_approvals` | JSON | | Per-section approval status ({s1, s2, s3, s4}) |
| `review_notes` | JSON | | Mentor feedback notes per section |
| `assets` | JSON | | Generated sales asset pack |
| `assets_status` | TEXT | DEFAULT 'pending' CHECK(assets_status IN ('pending', 'ready', 'delivered')) | Asset delivery status |
| `assets_delivered_at` | DATETIME | | When assets were delivered |
| `toolkit_enabled` | INTEGER | DEFAULT 0 CHECK(toolkit_enabled IN (0, 1)) | Whether toolkit is accessible |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Record creation |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Last modification |

**Indexes:**
- `idx_pipeline_user_id` on (`user_id`) — All lookups are by user_id
- `idx_pipeline_status_composite` on (`research_status`, `brand_brain_status`, `assets_status`) — Admin pipeline overview filtering

---

### Table: `audio_recordings`

**Purpose:** Voice-recorded answers per diagnostic question

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Recording ID |
| `user_id` | TEXT | NOT NULL REFERENCES users(id) ON DELETE CASCADE | Owner mentor |
| `module` | TEXT | NOT NULL CHECK(module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')) | Which diagnostic module |
| `question_id` | TEXT | NOT NULL | Question identifier within module (e.g., '1.1', '2.2a') |
| `file_path` | TEXT | NOT NULL | Physical file path on disk |
| `transcript` | TEXT | | AI-generated transcript |
| `duration_seconds` | INTEGER | CHECK(duration_seconds >= 0) | Audio duration |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Upload time |

**Indexes:**
- `idx_audio_user_module` on (`user_id`, `module`) — List recordings per user per module
- `idx_audio_user_id` on (`user_id`) — List all recordings for a user

---

### Table: `uploaded_files`

**Purpose:** Documents and materials uploaded by mentors

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | File record ID |
| `user_id` | TEXT | NOT NULL REFERENCES users(id) ON DELETE CASCADE | Owner mentor |
| `category` | TEXT | NOT NULL | File category (e.g., 'materials', 'sales') |
| `file_name` | TEXT | NOT NULL | Original file name |
| `file_path` | TEXT | NOT NULL | Physical file path on disk |
| `file_type` | TEXT | | MIME type |
| `file_size` | INTEGER | CHECK(file_size >= 0) | File size in bytes |
| `url` | TEXT | | Serving URL |
| `module` | TEXT | DEFAULT 'general' | Associated diagnostic module |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Upload time |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Last modification |

**Indexes:**
- `idx_files_user_id` on (`user_id`) — List all files for a user
- `idx_files_user_category` on (`user_id`, `category`) — Filter by category

---

### Removed Tables

| Table | Reason | Migration Path |
|-------|--------|----------------|
| `user_progress` | Fully replaced by `diagnostic_data` | Migrate existing data, then DROP |
| `tasks` | Unused — no references in codebase | Verify zero rows, then DROP |
| `submissions` | Redundant with diagnostic submit flow | Verify zero active rows, then DROP |

---

## 5. Normalization Strategy

### Normalization Level: 3NF (pragmatic)

The schema achieves Third Normal Form for structural columns (IDs, statuses, timestamps, foreign keys) while intentionally using JSON for document-like data.

### Denormalization Decisions

| What | Why | Trade-off | Consistency |
|------|-----|-----------|-------------|
| `email`, `name` in `diagnostic_data` | Avoid JOIN on most frequent read (P1: every page load) | Duplicate data | Acceptable: name/email rarely change; < 100 rows |
| JSON modules in `diagnostic_data` | Variable-structure nested data; always read/written as unit | Not queryable at field level | Acceptable: app never queries individual fields |
| JSON AI outputs in `pipeline` | Large AI-generated docs; structure evolves with model versions | Not queryable at field level | Acceptable: always read/written as complete documents |

### What is NOT denormalized

- User identity → `users` is the single source of truth
- Relationship keys → All `user_id` references point to `users.id`
- Status fields → All are proper columns with CHECK constraints (queryable, indexable)
- Timestamps → All are proper columns (sortable, filterable)

---

## 6. Indexing Strategy

### Index Summary

| Index | Table | Columns | Type | Purpose |
|-------|-------|---------|------|---------|
| PK (auto) | all | `id` | B-tree | Primary key lookup |
| `idx_users_email` | `users` | `email` | B-tree UNIQUE | Login lookup |
| `idx_diagnostic_user_id` | `diagnostic_data` | `user_id` | B-tree UNIQUE | User diagnostic lookup (P1, P2) |
| `idx_diagnostic_status` | `diagnostic_data` | `status` | B-tree | Admin filter by status |
| `idx_pipeline_user_id` | `pipeline` | `user_id` | B-tree | Pipeline lookup (P3) |
| `idx_pipeline_status_composite` | `pipeline` | `research_status, brand_brain_status, assets_status` | B-tree | Admin pipeline overview (S5) |
| `idx_audio_user_id` | `audio_recordings` | `user_id` | B-tree | User audio listing (S3) |
| `idx_audio_user_module` | `audio_recordings` | `user_id, module` | B-tree | Module-scoped audio listing (P4) |
| `idx_files_user_id` | `uploaded_files` | `user_id` | B-tree | User files listing (P5) |
| `idx_files_user_category` | `uploaded_files` | `user_id, category` | B-tree | Category-filtered listing |

### Index Rationale

- **Every foreign key is indexed** — Required for JOIN performance and CASCADE deletes
- **Composite indexes** on `(user_id, module)` and `(user_id, category)` serve the most common filtered queries
- **Status indexes** serve admin dashboard filtering
- **No over-indexing** — At < 100 users, excessive indexes hurt write performance more than they help reads

---

## 7. Constraints & Data Integrity

### Primary Keys
All tables use TEXT primary keys with application-generated IDs:
- Users: `user-{timestamp}-{random}` or `admin-001`
- Diagnostic: `diag-{userId}`
- Pipeline: UUID v4
- Audio/Files: Application-generated

**Rationale:** TEXT PKs are appropriate for SQLite at this scale. UUID v4 for pipeline ensures uniqueness without coordination. No auto-increment needed.

### Foreign Keys

| Child Table | Column | Parent | ON DELETE | Rationale |
|-------------|--------|--------|-----------|-----------|
| `diagnostic_data` | `user_id` | `users(id)` | CASCADE | User deletion removes all data |
| `pipeline` | `user_id` | `users(id)` | CASCADE | User deletion removes pipeline |
| `audio_recordings` | `user_id` | `users(id)` | CASCADE | User deletion removes recordings |
| `uploaded_files` | `user_id` | `users(id)` | CASCADE | User deletion removes files |

**CRITICAL:** SQLite requires `PRAGMA foreign_keys = ON` at every connection. This must be set before any queries.

### CHECK Constraints

| Table | Column | Constraint | Purpose |
|-------|--------|------------|---------|
| `users` | `role` | `IN ('member', 'admin')` | Valid roles only |
| `diagnostic_data` | `status` | `IN ('in_progress', 'submitted')` | Valid statuses |
| `diagnostic_data` | `current_module` | `IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')` | Valid modules |
| `diagnostic_data` | `progress_percentage` | `BETWEEN 0 AND 100` | Valid range |
| `pipeline` | `research_status` | `IN ('pending', 'in_progress', 'complete')` | Valid statuses |
| `pipeline` | `brand_brain_status` | `IN ('pending', 'generated', 'danilo_review', 'mentor_review', 'approved')` | Valid statuses |
| `pipeline` | `assets_status` | `IN ('pending', 'ready', 'delivered')` | Valid statuses |
| `pipeline` | `toolkit_enabled` | `IN (0, 1)` | Boolean enforcement |
| `audio_recordings` | `module` | `IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')` | Valid modules |
| `audio_recordings` | `duration_seconds` | `>= 0` | Non-negative duration |
| `uploaded_files` | `file_size` | `>= 0` | Non-negative size |

### NOT NULL Constraints

Applied to all columns that must always have a value:
- All `id` columns (primary keys)
- All `user_id` foreign keys
- All `created_at` and `updated_at` timestamps
- `email` in users and diagnostic_data
- `file_name`, `file_path`, `category` in uploaded_files
- `module`, `question_id`, `file_path` in audio_recordings

---

## 8. Security Architecture

### Authentication Model
- **HubSpot-based:** Users authenticate via email verification against HubSpot deals API
- **JWT tokens:** 24-hour expiry, contain userId, email, role, name
- **Admin:** Hardcoded email + password from environment variable
- **No database-level auth:** All security is application-layer (Express middleware)

### Authorization
- **Role-based:** `member` vs `admin` roles in JWT
- **Middleware enforcement:** `authMiddleware` (all routes) + `adminMiddleware` (admin routes)
- **Data isolation:** All user queries filter by `user_id` from JWT — users cannot access other users' data

### Sensitive Data Inventory

| Data | Location | Protection |
|------|----------|------------|
| Email addresses | `users.email`, `diagnostic_data.email` | Application-level access control |
| JWT secret | `.env` (JWT_SECRET) | Environment variable, not in DB |
| Admin password | `.env` (ADMIN_PASSWORD) | Environment variable, plaintext comparison (should be hashed) |
| HubSpot token | `.env` (HUBSPOT_PRIVATE_TOKEN) | Environment variable, never stored in DB |
| Audio recordings | File system (`data/audio/`) | Application-level access control |
| Uploaded files | File system (`data/uploads/`) | Application-level access control |

### Security Recommendations

1. **Hash admin password** — Currently plaintext comparison. Use bcryptjs (already a dependency)
2. **Enable WAL mode** — Reduces risk of DB corruption from concurrent access
3. **PRAGMA foreign_keys = ON** — Must be set on every connection to enforce constraints
4. **File path validation** — Prevent path traversal attacks in audio/file serving routes

---

## 9. SQLite-Specific Configuration

### Recommended PRAGMAs

```sql
-- Set on every connection open:
PRAGMA journal_mode = WAL;          -- Better concurrent read performance
PRAGMA foreign_keys = ON;           -- Enforce FK constraints
PRAGMA busy_timeout = 5000;         -- Wait 5s on lock instead of failing immediately
PRAGMA synchronous = NORMAL;        -- Good balance of safety vs speed for WAL mode
PRAGMA cache_size = -8000;          -- 8MB cache (default is 2MB)
```

### Connection Management

SQLite handles concurrency through file-level locking. With WAL mode:
- **Multiple readers** can run simultaneously
- **Single writer** at a time (with busy_timeout for waiting)
- Sufficient for 1–5 concurrent users

---

## 10. Migration & Evolution Strategy

### Initial Migration (v1.x → v2.0)

The migration must be executed in a specific order to respect dependencies:

```
Phase 1: Enable PRAGMAs (WAL, foreign_keys)
Phase 2: Migrate data from user_progress → diagnostic_data (if any orphaned records)
Phase 3: Add new constraints and indexes to existing tables
Phase 4: Drop legacy tables (user_progress, tasks, submissions)
Phase 5: Add triggers for updated_at
```

### Migration File Structure

```
mentoria-main/
  migrations/
    001_enable_pragmas.sql
    002_migrate_legacy_data.sql
    003_add_constraints_and_indexes.sql
    004_drop_legacy_tables.sql
    005_add_triggers.sql
```

### Change Management

- **Naming convention:** `NNN_description.sql` (sequential numbering)
- **Always create a snapshot** before migration: `cp data/prosperus.db data/prosperus-backup-{date}.db`
- **Rollback:** Each migration should have a corresponding rollback script
- **Testing:** Run `*dry-run` before `*apply-migration`

### Backward Compatibility

The v1.x → v2.0 migration is **not backward compatible**. The application code (server.cjs) must be updated simultaneously to:
1. Remove references to `user_progress`, `tasks`, `submissions`
2. Add `PRAGMA foreign_keys = ON` on connection open
3. Use ON DELETE CASCADE instead of manual cascade in delete endpoint
4. Add `PRAGMA journal_mode = WAL` on startup

---

## 11. Performance Optimization

### Query Optimization

| Current Issue | Fix | Impact |
|---------------|-----|--------|
| No indexes on `user_id` FKs | Add indexes on all `user_id` columns | Faster lookups (O(log n) vs O(n)) |
| No WAL mode | Enable WAL | Concurrent reads without blocking |
| Manual cascade delete (nested callbacks) | Use FK ON DELETE CASCADE | Single DELETE triggers all cascades |
| Admin list query joins 3 tables without indexes | Add indexes on join columns | Faster admin dashboard |

### Connection Optimization

```javascript
// Set PRAGMAs immediately after connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (!err) {
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA busy_timeout = 5000');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA cache_size = -8000');
  }
});
```

### Monitoring

- Log slow queries (> 100ms) with execution time
- Monitor DB file size growth
- Track WAL file size (checkpoint if > 10MB)

---

## 12. Scalability & Growth

### Current Capacity

SQLite handles this workload comfortably:
- < 100 users
- < 10MB database
- < 5 concurrent connections
- Single server deployment

### When to Migrate to PostgreSQL/Supabase

Consider migration when ANY of these thresholds are reached:
- **> 500 active users** — Write contention becomes an issue
- **> 50 concurrent connections** — SQLite single-writer bottleneck
- **Multi-server deployment** — SQLite doesn't support network access
- **Need for Realtime subscriptions** — Supabase advantage
- **Need for RLS** — Row-level security requires PostgreSQL

### Data Archival

At current scale, no archival needed. If growth exceeds expectations:
- Archive completed+delivered pipeline records older than 12 months
- Keep diagnostic_data indefinitely (core business data)

---

## 13. Testing & Validation

### Unit Tests
- Verify all CHECK constraints reject invalid values
- Verify FK constraints prevent orphaned records
- Verify ON DELETE CASCADE removes all child records

### Integration Tests
- Test complete user lifecycle: create → diagnostic → pipeline → delete
- Test concurrent read/write with WAL mode
- Test migration scripts on copy of production DB

### Data Validation
- Verify no orphaned records exist in child tables
- Verify all `user_id` references point to valid users
- Verify JSON columns contain valid JSON

---

## 14. Implementation Plan

### Phase 1: Foundation (Safety)
1. Create backup of current `prosperus.db`
2. Create migration directory structure
3. Write and test migration scripts
4. Enable WAL mode and PRAGMAs

### Phase 2: Schema Cleanup
1. Migrate any orphaned data from `user_progress` → `diagnostic_data`
2. Add FK constraints with ON DELETE CASCADE
3. Add CHECK constraints on status/enum columns
4. Add missing `updated_at` columns
5. Add all indexes

### Phase 3: Legacy Removal
1. Verify `user_progress`, `tasks`, `submissions` have no critical data
2. DROP legacy tables
3. Update `server.cjs` to remove all legacy table references

### Phase 4: Application Updates
1. Add PRAGMA setup on connection open
2. Simplify delete endpoint (use CASCADE instead of manual)
3. Add `updated_at` trigger or application-level updates
4. Remove legacy `user_progress` read/write code

### Rollout
- **Strategy:** Offline migration (stop server → backup → migrate → restart)
- **Validation:** Run smoke tests after migration
- **Rollback:** Restore from backup if validation fails

---

## Appendix

### A. Complete DDL Script (v2.0)

```sql
-- ============================================
-- Prosperus Mentor Diagnosis — Schema v2.0
-- Engine: SQLite 3
-- ============================================

-- PRAGMAs (must be set on every connection)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -8000;

-- ============================================
-- TABLE: users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK(role IN ('member', 'admin')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABLE: diagnostic_data
-- ============================================
CREATE TABLE IF NOT EXISTS diagnostic_data (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  pre_module JSON,
  mentor JSON,
  mentee JSON,
  method JSON,
  offer JSON,
  current_module TEXT DEFAULT 'pre_module'
    CHECK(current_module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')),
  current_step INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0
    CHECK(progress_percentage BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK(status IN ('in_progress', 'submitted')),
  submitted_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_status
  ON diagnostic_data(status);

-- ============================================
-- TABLE: pipeline
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  research_dossier JSON,
  research_status TEXT DEFAULT 'pending'
    CHECK(research_status IN ('pending', 'in_progress', 'complete')),
  research_completed_at DATETIME,
  brand_brain JSON,
  brand_brain_status TEXT DEFAULT 'pending'
    CHECK(brand_brain_status IN ('pending', 'generated', 'danilo_review', 'mentor_review', 'approved')),
  brand_brain_version INTEGER DEFAULT 0,
  brand_brain_completed_at DATETIME,
  section_approvals JSON,
  review_notes JSON,
  assets JSON,
  assets_status TEXT DEFAULT 'pending'
    CHECK(assets_status IN ('pending', 'ready', 'delivered')),
  assets_delivered_at DATETIME,
  toolkit_enabled INTEGER DEFAULT 0
    CHECK(toolkit_enabled IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipeline_user_id
  ON pipeline(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_status_composite
  ON pipeline(research_status, brand_brain_status, assets_status);

-- ============================================
-- TABLE: audio_recordings
-- ============================================
CREATE TABLE IF NOT EXISTS audio_recordings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL
    CHECK(module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')),
  question_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  transcript TEXT,
  duration_seconds INTEGER
    CHECK(duration_seconds >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audio_user_id
  ON audio_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_user_module
  ON audio_recordings(user_id, module);

-- ============================================
-- TABLE: uploaded_files
-- ============================================
CREATE TABLE IF NOT EXISTS uploaded_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER
    CHECK(file_size >= 0),
  url TEXT,
  module TEXT DEFAULT 'general',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_user_id
  ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_category
  ON uploaded_files(user_id, category);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
  BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_diagnostic_updated_at
  AFTER UPDATE ON diagnostic_data
  FOR EACH ROW
  BEGIN
    UPDATE diagnostic_data SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_pipeline_updated_at
  AFTER UPDATE ON pipeline
  FOR EACH ROW
  BEGIN
    UPDATE pipeline SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_files_updated_at
  AFTER UPDATE ON uploaded_files
  FOR EACH ROW
  BEGIN
    UPDATE uploaded_files SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;

-- ============================================
-- SEED: Default admin user
-- ============================================
INSERT OR IGNORE INTO users (id, email, name, role)
  VALUES ('admin-001', 'admin@salesprime.com.br', 'Admin', 'admin');
```

### B. Entity-Relationship Diagram (ASCII)

```
┌──────────────┐
│    users     │
├──────────────┤
│ PK id        │
│    email (U) │
│    name      │
│    role      │
│    created_at│
│    updated_at│
└──────┬───────┘
       │
       │ 1
       │
       ├────────────────────────────────────────────┐
       │                                            │
       │ 0..1                                       │ 0..1
┌──────┴───────────┐                    ┌───────────┴──────┐
│ diagnostic_data  │                    │    pipeline      │
├──────────────────┤                    ├──────────────────┤
│ PK id            │                    │ PK id            │
│ FK user_id (U)   │                    │ FK user_id       │
│    email         │                    │    research_*    │
│    name          │                    │    brand_brain_* │
│    pre_module  J │                    │    section_app J │
│    mentor      J │                    │    review_notes J│
│    mentee      J │                    │    assets      J │
│    method      J │                    │    assets_*      │
│    offer       J │                    │    toolkit_en    │
│    current_*     │                    │    created_at    │
│    progress_%    │                    │    updated_at    │
│    status        │                    └──────────────────┘
│    submitted_at  │
│    created_at    │
│    updated_at    │
└──────────────────┘

       │
       ├────────────────────────────────────────────┐
       │                                            │
       │ 0..N                                       │ 0..N
┌──────┴───────────┐                    ┌───────────┴──────┐
│ audio_recordings │                    │ uploaded_files   │
├──────────────────┤                    ├──────────────────┤
│ PK id            │                    │ PK id            │
│ FK user_id       │                    │ FK user_id       │
│    module        │                    │    category      │
│    question_id   │                    │    file_name     │
│    file_path     │                    │    file_path     │
│    transcript    │                    │    file_type     │
│    duration_s    │                    │    file_size     │
│    created_at    │                    │    url           │
└──────────────────┘                    │    module        │
                                        │    created_at    │
                                        │    updated_at    │
                                        └──────────────────┘

Legend: PK = Primary Key, FK = Foreign Key, U = Unique, J = JSON
```

### C. Glossary

| Term | Definition |
|------|-----------|
| **Diagnostic** | 5-module questionnaire completed by mentors |
| **Brand Brain** | AI-generated brand strategy document with 4 sections (ICP, Offer, Positioning, Copy) |
| **Pipeline** | The admin-controlled workflow: Diagnostic → Research → Brand Brain → Review → Assets → Delivered |
| **Hormozi 6-Step** | Framework for describing ideal client transformation (Before Internal/External, Decision Fears/Trigger, After External/Internal) |
| **MLS** | Multi-Level Structure — a type of mentoring program goal |
| **Pre-Module** | Initial data collection: existing materials, social profiles, competitors |
| **Asset Pack** | Generated sales materials (outreach script, follow-up sequences, sales script, landing page copy, VSL script) |

---

*Generated by Dara (Data Engineer Agent) — Synkra AIOS*
*Schema Design Template v1.0.0*
