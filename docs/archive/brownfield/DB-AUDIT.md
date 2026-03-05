# Database Audit — Prosperus Mentoria Platform

**Phase 2: Brownfield Discovery**
**Agent:** @data-engineer (Dara)
**Date:** 2026-02-28

---

## Security Audit

### SQL Injection: PASS
All queries use parameterized `?` placeholders. Dynamic SQL construction uses hardcoded column maps, not user input.

### Authentication & Authorization: GOOD
All user endpoints filter by `req.user.userId`. Admin endpoints require `adminMiddleware`. No horizontal privilege escalation possible.

### CRITICAL Issues
| ID | Issue | Location | Impact |
|---|---|---|---|
| TD-DB-01 | .env with plaintext secrets committed | .env | Full credential compromise |
| TD-DB-02 | JWT_SECRET hardcoded fallback 'prosperus-secret-key-2024' | server.cjs:26 | Authentication bypass |

### HIGH Issues
| ID | Issue | Location |
|---|---|---|
| TD-DB-03 | pipeline.user_id lacks UNIQUE constraint | server.cjs:132 |
| TD-DB-04 | Indexes/triggers not created for fresh databases | server.cjs:87-205 |
| TD-DB-05 | No pagination on admin listing endpoints | admin-users.cjs, admin-pipeline.cjs |
| TD-DB-06 | Admin password stored/compared in plaintext | auth.cjs:217 |

### MEDIUM Issues
| ID | Issue | Location |
|---|---|---|
| TD-DB-07 | Denormalized email/name in diagnostic_data | server.cjs:109-110 |
| TD-DB-08 | No schema version tracking table | migrations/ |
| TD-DB-09 | expert_notes ALTER TABLE on every startup | server.cjs:157-161 |
| TD-DB-10 | CORS fully open (origin: '*') | server.cjs:49 |
| TD-DB-11 | No email format validation | auth.cjs |
| TD-DB-12 | Single SQLite file, no connection pooling | server.cjs:72 |
| TD-DB-13 | No automated rollback/down-migrations | migrations/ |
| TD-DB-14 | JSON.parse without try-catch in some routes | brand-brain.cjs, admin-pipeline.cjs |
| TD-DB-15 | No CHECK on audio_recordings.question_id format | server.cjs:168 |

### LOW Issues
| ID | Issue | Location |
|---|---|---|
| TD-DB-16 | No updated_at on audio_recordings | server.cjs:163-177 |
| TD-DB-17 | uploaded_files.url column never populated (dead) | server.cjs:190 |
| TD-DB-18 | Pipeline status composite index underutilized | migrations/009 |
| TD-DB-19 | Debug/test routes active in production | health.cjs:17-21 |

---

## Performance Analysis

### Good
- WAL mode enabled for concurrent reads
- Proper PRAGMAs for performance
- Admin pipeline list wisely excludes large JSON columns

### Gaps
- Missing indexes on fresh databases (full table scans)
- N+1 pattern in HubSpot deal verification (auth.cjs)
- No pagination on admin endpoints (all rows returned)

---

## Data Integrity

### Good
- All child tables have ON DELETE CASCADE
- CHECK constraints on enums and ranges
- Trigger guards prevent infinite recursion

### Gaps
- pipeline.user_id missing UNIQUE (1:1 not enforced)
- email/name denormalized between users and diagnostic_data
- No schema_migrations version tracking

---

## Migration Health: EXCELLENT
- 11 sequential migration files (001-011)
- Proper safety comments and data sanitization
- Automatic backups before migration
- Two runners: shell script + Node.js
- No automated rollback (manual backup restore only)

---

## Recommendations (Priority)
1. Rotate all exposed credentials immediately
2. Add UNIQUE on pipeline.user_id
3. Move index/trigger creation into initializeDatabase()
4. Add schema_version tracking table
5. Implement pagination on admin endpoints
6. Hash admin password with bcrypt
7. Add JSON.parse try-catch everywhere
8. Remove/gate debug routes
