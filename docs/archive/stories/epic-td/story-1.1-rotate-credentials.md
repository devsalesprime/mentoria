# Story 1.1: Rotacionar Credenciais e Proteger Segredos

**Epic:** EPIC-TD-001
**Status:** InProgress
**Points:** 3
**Priority:** P0
**Phase:** 1 — Seguranca & Quick Wins

---

## Descricao

As credenciais da aplicacao (HubSpot token, Gemini API key, admin password, JWT secret) estao expostas no codigo-fonte em texto plano. Este e o risco de seguranca mais critico e deve ser resolvido imediatamente.

## Acceptance Criteria

- [ ] AC1: Given .env file, When checked, Then HUBSPOT_PRIVATE_TOKEN is rotated to new value *(MANUAL: rotate in HubSpot dashboard)*
- [ ] AC2: Given .env file, When checked, Then GEMINI_APIKEY is rotated to new value *(MANUAL: rotate in Google AI Studio)*
- [x] AC3: Given .env file, When checked, Then ADMIN_PASSWORD is changed to strong password
- [x] AC4: Given .env file, When checked, Then JWT_SECRET is set (no hardcoded fallback in server.cjs)
- [x] AC5: Given server.cjs, When JWT_SECRET env var is missing, Then server fails to start with clear error
- [x] AC6: Given ecosystem.config.cjs, When checked, Then no hardcoded passwords exist
- [x] AC7: Given .gitignore, When checked, Then .env is listed and not tracked
- [x] AC8: Given admin login with bcrypt, When admin enters password, Then bcrypt.compare is used (not plaintext)
- [x] AC9: Given auth.cjs, When checked, Then no debug logging of password lengths

## Scope

**IN:** Credential rotation, JWT enforcement, bcrypt implementation, .gitignore update, PM2 config cleanup
**OUT:** Full auth system redesign, OAuth implementation

## Tasks

- [ ] 1. Generate new HubSpot private token in HubSpot settings *(MANUAL)*
- [ ] 2. Generate new Gemini API key in Google AI Studio *(MANUAL)*
- [x] 3. Generate strong admin password
- [x] 4. Generate random JWT_SECRET (32+ chars)
- [x] 5. Update .env with all new values
- [x] 6. Modify server.cjs: require JWT_SECRET, fail if missing
- [x] 7. Implement bcrypt hash comparison in auth.cjs
- [x] 8. Remove debug logging from auth.cjs (lines 209-210)
- [x] 9. Clean ecosystem.config.cjs (remove hardcoded password)
- [x] 10. Add .env to .gitignore (already present)
- [x] 11. Create .env.example with placeholder values
- [x] 12. Restart server and verify all auth flows work

## Debts Resolved

SEC-01, SEC-02, SEC-03, SEC-04, UX-16

## Estimated Effort: 6 hours

## File List

- [x] .env (rotated — JWT_SECRET, ADMIN_PASSWORD_HASH, strong values)
- [x] .env.example (new — placeholder template)
- [x] .gitignore (already had .env)
- [x] server.cjs (JWT_SECRET required, no fallback, ADMIN_PASSWORD_HASH)
- [x] routes/auth.cjs (bcrypt.compare, debug logging removed)
- [x] ecosystem.config.cjs (hardcoded passwords removed)
