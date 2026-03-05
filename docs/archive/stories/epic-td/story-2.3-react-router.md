# Story 2.3: Implementar React Router com Deep-Linking

**Epic:** EPIC-TD-001 | **Status:** Done | **Points:** 13 | **Priority:** P1 | **Phase:** 2

## Descricao
A aplicacao nao tem routing. Todas as navegacoes sao via state. Implementar React Router v6+ com browser history para permitir deep-links, back/forward, e session persistence.

## Acceptance Criteria
- [x] AC1: react-router-dom installed
- [x] AC2: Routes defined: /, /login, /dashboard, /dashboard/:module, /brand-brain, /assets, /admin
- [x] AC3: Browser back/forward navigates correctly (useNavigate with replace)
- [x] AC4: Page refresh preserves current view (member token in localStorage)
- [x] AC5: Admin session persists in localStorage across refresh
- [x] AC6: Deep-links work (sharing /dashboard/mentor loads correct view)
- [x] AC7: 404 route shows friendly fallback page
- [x] AC8: Auth-gated routes redirect to /login when not authenticated

## Scope
**IN:** React Router v6, history routing, auth guards, 404 page, admin session persistence
**OUT:** SSR, route-level code splitting (future), animated transitions between routes

## Tasks
- [x] 1. npm install react-router-dom
- [x] 2. Create route structure in App.tsx with BrowserRouter + Routes
- [x] 3. Create AuthGuard component (redirect to /login if not authenticated)
- [x] 4. Create AdminGuard component (redirect to /login if not admin)
- [x] 5. Migrate Dashboard navigation from state to routes (/dashboard/:module)
- [x] 6. Migrate admin navigation to /admin route
- [x] 7. Store admin token in localStorage (not just state)
- [x] 8. Create 404 NotFound component
- [x] 9. Update all internal navigation to use useNavigate
- [x] 10. Verify Express SPA fallback handles all routes (already implemented)
- [x] 11. Build verification passes

## Dev Notes
- URL slug mapping: pre-module↔pre_module, brand-brain↔brand_brain_review, assets↔deliverables, complete↔diagnostic_complete
- BrowserRouter basename uses import.meta.env.BASE_URL for dev/prod compatibility
- LandingPage and LoginPage extracted as separate route components
- Dashboard reads :module param and syncs with internal activeItem state
- Admin token persisted in localStorage with JWT expiry check on restore

## File List
- `components/routing/AuthGuard.tsx` — NEW: Auth guard, redirects to /login
- `components/routing/AdminGuard.tsx` — NEW: Admin guard, redirects to /login
- `components/routing/NotFound.tsx` — NEW: 404 page
- `components/routing/LandingPage.tsx` — NEW: Landing page extracted from App
- `components/routing/LoginPage.tsx` — NEW: Login route handler
- `App.tsx` — REWRITTEN: BrowserRouter + Routes + auth state
- `components/Dashboard.tsx` — MODIFIED: useParams + useNavigate, navigateTo helper

## Debts Resolved: UX-02, UX-04, UX-14, ARCH-03
## Estimated Effort: 20 hours
