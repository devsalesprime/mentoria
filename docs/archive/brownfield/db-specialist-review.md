# Database Specialist Review

**Phase 5: Brownfield Discovery**
**Reviewer:** @data-engineer (Dara)
**Date:** 2026-02-28
**Source:** docs/prd/technical-debt-DRAFT.md (Database section)

---

## Debts Validated

| ID | Debt | Original Severity | Validated Severity | Est. Hours | Priority | Notes |
|---|---|---|---|---|---|---|
| TD-DB-01 | .env with plaintext secrets | CRITICAL | **CRITICAL** | 2h | P0 | Rotate ALL keys immediately. Add .env to .gitignore. |
| TD-DB-02 | JWT_SECRET hardcoded fallback | CRITICAL | **CRITICAL** | 1h | P0 | Remove fallback, require env var, fail startup if missing |
| TD-DB-03 | pipeline.user_id lacks UNIQUE | HIGH | **HIGH** | 4h | P1 | Requires table recreation (same migration pattern as 005). Race condition risk is real. |
| TD-DB-04 | Indexes not in initializeDatabase() | HIGH | **HIGH** | 3h | P1 | Copy index/trigger SQL from migrations into server.cjs init block |
| TD-DB-05 | No pagination on admin endpoints | HIGH | **HIGH** | 6h | P2 | Implement LIMIT/OFFSET with cursor support. Both admin-users and admin-pipeline. |
| TD-DB-06 | Admin password plaintext | HIGH | **CRITICAL** (upgraded) | 3h | P0 | bcryptjs is already installed! Just use it. Hash on startup or migration. |
| TD-DB-07 | Denormalized email/name | MEDIUM | **MEDIUM** | 8h | P3 | Low risk currently. Fix when refactoring admin queries to use JOINs. |
| TD-DB-08 | No schema version tracking | MEDIUM | **HIGH** (upgraded) | 4h | P2 | Essential for safe incremental migrations. Add schema_migrations table. |
| TD-DB-09 | expert_notes ALTER on startup | MEDIUM | **LOW** (downgraded) | 1h | P4 | Works fine in practice. Low risk. Fix when doing schema migration work. |
| TD-DB-10 | CORS open | MEDIUM | **MEDIUM** | 1h | P2 | Overlap with TD-SYS-04. Fix once in server.cjs. |
| TD-DB-11 | No email validation | MEDIUM | **LOW** (downgraded) | 2h | P4 | HubSpot already validates emails exist. Low real-world risk. |
| TD-DB-12 | Single SQLite, no pooling | MEDIUM | **MEDIUM** | 0h (monitor) | P3 | WAL + busy_timeout mitigates. Fine for <500 concurrent users. Monitor, don't fix. |
| TD-DB-13 | No down-migrations | MEDIUM | **MEDIUM** | 4h | P3 | Add per-migration rollback scripts. Not urgent — backups exist. |
| TD-DB-14 | JSON.parse without try-catch | MEDIUM | **MEDIUM** | 3h | P2 | Add try-catch with fallback to `{}`. Prevents 500 on corrupted data. |
| TD-DB-15 | No CHECK on question_id | MEDIUM | **LOW** | 1h | P4 | Low impact — question IDs are app-generated, not user input. |
| TD-DB-16 | No updated_at on audio | LOW | **LOW** | 1h | P4 | Nice to have for transcript tracking. Low priority. |
| TD-DB-17 | uploaded_files.url dead column | LOW | **LOW** | 0.5h | P4 | Drop column in next migration. Harmless. |
| TD-DB-18 | Composite index underused | LOW | **LOW** | 0h | P5 | Keep it — may be useful for future analytics queries. Zero cost. |
| TD-DB-19 | Debug routes in production | LOW | **MEDIUM** (upgraded) | 1h | P2 | POST /api/test echoes request body — info disclosure risk. Gate behind NODE_ENV. |

---

## Debts Added (not in original DRAFT)

| ID | Debt | Severity | Est. Hours | Priority | Details |
|---|---|---|---|---|---|
| TD-DB-20 | **No database backup automation** | MEDIUM | 4h | P2 | Backups only exist from migration runs. No scheduled backup. Add daily SQLite backup to cron or PM2 startup. |
| TD-DB-21 | **No database file size monitoring** | LOW | 2h | P4 | SQLite files can grow unbounded. Large JSON blobs in pipeline table (brand_brain, research_dossier) could cause growth. Add size alert. |
| TD-DB-22 | **INSERT OR IGNORE pattern for admin user seed** | LOW | 1h | P4 | If admin email changes in env, old admin persists with wrong email. Should use UPSERT pattern. |

---

## Answers to @architect Questions

### Q1: Is SQLite sustainable for expected scale?
**For up to ~500 concurrent users: YES**, with current WAL mode and busy_timeout configuration. SQLite handles thousands of reads/sec and hundreds of writes/sec in WAL mode. The pipeline JSON blobs are the growth concern, not query volume.

**For 1000+ users: EVALUATE.** The main bottleneck will be:
- Write lock contention (single writer in SQLite)
- JSON blob sizes in pipeline table (brand_brain can be 50KB+)
- Admin list endpoints without pagination returning all rows

**Recommendation:** Keep SQLite for now. Add pagination (TD-DB-05) and monitoring (TD-DB-21). If write contention becomes measurable, plan PostgreSQL migration.

### Q2: Migrate to PostgreSQL/Supabase?
**Not yet.** The migration cost is significant (rewrite all callback-style sqlite3 calls, change all SQL syntax nuances, set up connection pooling). The current scale doesn't justify it.

**When to migrate:** If any of these occur:
- Write latency >100ms consistently
- User base exceeds ~500 active users
- Need for full-text search or complex queries
- Need for real-time subscriptions (Supabase)
- Multi-server deployment required

### Q3: Denormalized email/name — remove now?
**Defer to Phase 3.** The denormalization currently works and the admin query already JOINs users anyway. Removing it requires updating diagnostic.cjs save logic and all admin queries that read it. Low risk, low urgency.

### Q4: Schema version tracking approach?
**Recommended: Simple `schema_migrations` table:**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);
```

Check before each migration: `SELECT version FROM schema_migrations WHERE version = ?`. Insert after successful migration. Simple, reliable, no external tools needed.

---

## Recommendations (Resolution Order)

### Immediate (P0) — Do first, hours not days
1. **TD-DB-01 + TD-DB-02**: Rotate secrets, enforce JWT_SECRET env var
2. **TD-DB-06**: Hash admin password with bcrypt (package already installed)

### Sprint 1 (P1) — Next development sprint
3. **TD-DB-03**: Add UNIQUE on pipeline.user_id (table recreation)
4. **TD-DB-04**: Move indexes/triggers into initializeDatabase()

### Sprint 2 (P2) — Following sprint
5. **TD-DB-08**: Add schema_migrations table
6. **TD-DB-05**: Pagination on admin endpoints
7. **TD-DB-14**: JSON.parse try-catch safety
8. **TD-DB-19**: Gate debug routes behind NODE_ENV
9. **TD-DB-20**: Automated backup schedule

### Backlog (P3-P5) — As time permits
10. TD-DB-07, TD-DB-13, TD-DB-12 (monitoring), rest

---

## Summary

| Severity | Count | Original | After Review |
|---|---|---|---|
| CRITICAL | 3 | 2 | 3 (+1 upgraded from HIGH) |
| HIGH | 3 | 4 | 3 (+1 upgraded, -2 confirmed) |
| MEDIUM | 7 | 9 | 7 (-2 downgraded, +1 new, +1 upgraded) |
| LOW | 6 | 4 | 6 (-2 downgraded from MEDIUM, +2 new) |
| **Total** | **19** | **19** | **19 + 3 new = 22** |

**Estimated total effort for all DB debts: ~52 hours**
**Critical path (P0+P1): ~10 hours**

---

*Review completed by @data-engineer (Dara) — 2026-02-28*
