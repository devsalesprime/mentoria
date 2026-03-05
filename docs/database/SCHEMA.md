# Database Schema — Prosperus Mentoria Platform

**Engine:** SQLite 3 (via sqlite3 npm package)
**File:** data/prosperus.db
**Schema Version:** v2.0

---

## Tables

### users
| Column | Type | Constraints | Default |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | — |
| email | TEXT | UNIQUE NOT NULL | — |
| name | TEXT | — | NULL |
| role | TEXT | NOT NULL, CHECK(IN('member','admin')) | 'member' |
| created_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |

### diagnostic_data
| Column | Type | Constraints | Default |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | — |
| user_id | TEXT | UNIQUE NOT NULL, FK → users(id) CASCADE | — |
| email | TEXT | NOT NULL | — |
| name | TEXT | — | NULL |
| pre_module | JSON | — | NULL |
| mentor | JSON | — | NULL |
| mentee | JSON | — | NULL |
| method | JSON | — | NULL |
| offer | JSON | — | NULL |
| current_module | TEXT | CHECK(IN 5 modules) | 'pre_module' |
| current_step | INTEGER | — | 0 |
| progress_percentage | INTEGER | CHECK(0-100) | 0 |
| status | TEXT | NOT NULL, CHECK(IN('in_progress','submitted')) | 'in_progress' |
| submitted_at | DATETIME | — | NULL |
| created_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |

### pipeline
| Column | Type | Constraints | Default |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | — |
| user_id | TEXT | NOT NULL, FK → users(id) CASCADE | — |
| research_dossier | JSON | — | NULL |
| research_status | TEXT | CHECK(IN('pending','in_progress','complete')) | 'pending' |
| research_completed_at | DATETIME | — | NULL |
| brand_brain | JSON | — | NULL |
| brand_brain_status | TEXT | CHECK(IN 5 statuses) | 'pending' |
| brand_brain_version | INTEGER | — | 0 |
| brand_brain_completed_at | DATETIME | — | NULL |
| section_approvals | JSON | — | NULL |
| review_notes | JSON | — | NULL |
| assets | JSON | — | NULL |
| assets_status | TEXT | CHECK(IN('pending','ready','delivered')) | 'pending' |
| assets_delivered_at | DATETIME | — | NULL |
| toolkit_enabled | INTEGER | CHECK(IN(0,1)) | 0 |
| created_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |
| expert_notes | JSON | — (ALTER TABLE migration) | NULL |

**NOTE:** `user_id` is NOT declared UNIQUE but operates as 1:1. Missing constraint.

### audio_recordings
| Column | Type | Constraints | Default |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | — |
| user_id | TEXT | NOT NULL, FK → users(id) CASCADE | — |
| module | TEXT | NOT NULL, CHECK(IN 5 modules) | — |
| question_id | TEXT | NOT NULL | — |
| file_path | TEXT | NOT NULL | — |
| transcript | TEXT | — | NULL |
| duration_seconds | INTEGER | CHECK(>= 0) | NULL |
| created_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |

### uploaded_files
| Column | Type | Constraints | Default |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | — |
| user_id | TEXT | NOT NULL, FK → users(id) CASCADE | — |
| category | TEXT | NOT NULL | — |
| file_name | TEXT | NOT NULL | — |
| file_path | TEXT | NOT NULL | — |
| file_type | TEXT | — | NULL |
| file_size | INTEGER | CHECK(>= 0) | NULL |
| url | TEXT | — (DEAD COLUMN — never populated) | NULL |
| module | TEXT | — | 'general' |
| created_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL | CURRENT_TIMESTAMP |

---

## Relationship Map (ERD)

```
users (1)
 ├── (1:1) → diagnostic_data   [user_id UNIQUE, CASCADE]
 ├── (1:1*) → pipeline          [user_id NOT UNIQUE — design gap]
 ├── (1:N) → audio_recordings   [user_id, CASCADE]
 └── (1:N) → uploaded_files     [user_id, CASCADE]
```

---

## Indexes (migration 009)

| Index | Table | Columns |
|---|---|---|
| idx_diagnostic_status | diagnostic_data | status |
| idx_pipeline_user_id | pipeline | user_id |
| idx_pipeline_status_composite | pipeline | research_status, brand_brain_status, assets_status |
| idx_audio_user_id | audio_recordings | user_id |
| idx_audio_user_module | audio_recordings | user_id, module |
| idx_files_user_id | uploaded_files | user_id |
| idx_files_user_category | uploaded_files | user_id, category |
| idx_users_role | users | role |

**WARNING:** Indexes only exist if migration runner was executed. `initializeDatabase()` in server.cjs does NOT create them.

---

## Triggers (migration 010)

| Trigger | Table | Purpose |
|---|---|---|
| trg_users_updated_at | users | Auto-set updated_at |
| trg_diagnostic_updated_at | diagnostic_data | Auto-set updated_at |
| trg_pipeline_updated_at | pipeline | Auto-set updated_at |
| trg_files_updated_at | uploaded_files | Auto-set updated_at |

All include `WHEN NEW.updated_at = OLD.updated_at` guard.

---

## PRAGMAs

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -8000;
```
