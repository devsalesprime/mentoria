# Story 1.2: Implementar Hardening de Seguranca do Servidor

**Epic:** EPIC-TD-001
**Status:** Done
**Points:** 5
**Priority:** P0
**Phase:** 1 — Seguranca & Quick Wins

---

## Descricao

O servidor Express nao possui headers de seguranca, rate limiting, ou restricao de CORS. Endpoints de teste estao ativos em producao. A chave de API do Gemini esta exposta no bundle frontend.

## Acceptance Criteria

- [x] AC1: Given any response, When checked, Then security headers are present (X-Frame-Options, CSP, etc.)
- [x] AC2: Given CORS config, When request from unknown origin, Then request is rejected
- [x] AC3: Given login endpoint, When 6+ attempts in 1 minute, Then rate limit response (429)
- [x] AC4: Given API endpoints, When 100+ requests in 1 minute, Then rate limit response (429)
- [x] AC5: Given vite.config.ts, When checked, Then no API keys injected into frontend
- [x] AC6: Given health.cjs, When NODE_ENV=production, Then POST /api/test returns 404
- [ ] AC7: Given securityheaders.com scan, When tested, Then grade is A or higher *(requires deployed env)*

## Scope

**IN:** helmet, cors restriction, rate-limit, API key removal from frontend, debug route gating
**OUT:** WAF, DDoS protection, SSL configuration (infrastructure-level)

## Tasks

- [x] 1. Install helmet: npm install helmet
- [x] 2. Install express-rate-limit: npm install express-rate-limit
- [x] 3. Add helmet middleware to server.cjs (with CSP directives)
- [x] 4. Restrict CORS to known origins (ALLOWED_ORIGINS env var)
- [x] 5. Add rate limiter: login (5/min), API (100/min)
- [x] 6. Remove process.env.API_KEY injection from vite.config.ts
- [ ] 7. Remove GoogleGenAI client-side usage from ActionPlanModule *(deferred to Story 1.3 — file deletion)*
- [x] 8. Gate POST /api/test behind NODE_ENV check
- [x] 9. Verify server starts with all hardening

## Debts Resolved

SEC-05, SEC-06, SEC-07, SEC-08, UX-17

## Estimated Effort: 8 hours

## File List

- [x] package.json (added helmet, express-rate-limit)
- [x] server.cjs (helmet + restricted CORS + rate-limit middleware)
- [x] vite.config.ts (removed API_KEY injection + loadEnv)
- [x] routes/health.cjs (test routes gated behind NODE_ENV)
