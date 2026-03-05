# Story UX-2.2: VSL — Unicode Fix, Observation Distinction, Clickable Stage Navigation

**Epic:** EPIC-UX-001 | **Status:** Done | **Points:** 5 | **Priority:** P1 | **Wave:** 2
**Depends on:** None

## Executor Assignment
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["manual-review"]

## Story
**As a** mentor using the VSL teleprompter,
**I want** the buttons to display correctly without broken unicode, I want to clearly distinguish observations from script text, and I want to click stage numbers to jump to that section,
**so that** I can use the teleprompter effectively for recording my VSL.

## Acceptance Criteria
- [x] AC1: No raw unicode escape sequences (`\uD83D\uDDFA...`) visible in any button, label, or header
- [x] AC2: Teleprompter view: observations/directions render in muted style (smaller, italicized, lower opacity)
- [x] AC3: Teleprompter view: script text renders in prominent large style, clearly distinguished from observations
- [x] AC4: Teleprompter view: clicking a numbered stage button scrolls to that stage's content
- [x] AC5: Scroll animation is smooth (not instant jump)
- [x] AC6: Auto-scroll pauses when user clicks a stage button, resumes on play

## Scope
**IN:** TeleprompterStageMap unicode fix, observation styling, stage click navigation
**OUT:** Changing teleprompter auto-scroll speed logic, modifying stage detection regex, adding new view modes

## Tasks

### Part A: Unicode Fix
- [x] 1. Find source of broken unicode (AC1)
  - [x] 1a. Check if unicode comes from prompt output (stored in DB) or from component rendering
  - [x] 1b. Search for raw `\uD83D` or surrogate pair sequences in TeleprompterStageMap.tsx
  - [x] 1c. Check stage map button labels and teleprompter control buttons
- [x] 2. Fix unicode rendering (AC1)
  - [x] 2a. If from prompt: add sanitization in parser to decode or strip broken surrogates
  - [x] 2b. If from component: fix the emoji/icon reference to use actual unicode characters or SVG icons
  - [x] 2c. Add a fallback: `text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]?|[\uD800-\uDFFF]/g, '')` to strip unpaired surrogates

### Part B: Observation vs Script Distinction
- [x] 3. Classify content types in teleprompter rendering (AC2, AC3)
  - [x] 3a. Observations: italic text (`*...*`), stage directions, bracketed instructions (`[INSERIR ...]`), tone annotations (`(tom ...)`)
  - [x] 3b. Script text: regular paragraphs — what the mentor reads aloud
- [x] 4. Style observations differently (AC2)
  - [x] 4a. Observations: `text-white/40 text-lg italic` (smaller, muted)
  - [x] 4b. Script text: `text-white/90 text-2xl sm:text-3xl` (current prominent style)
  - [x] 4c. Detection: check if paragraph starts/ends with `*` (italic) or `(` (tone) or `[` (bracket)
- [x] 5. Test with actual VSL content — verify no false positives (script text incorrectly classified as observation)

### Part C: Clickable Stage Navigation
- [x] 6. Make stage buttons scroll to their section (AC4, AC5, AC6)
  - [x] 6a. Each stage divider in teleprompter content needs a unique `id` or `ref` (e.g., `stage-{number}`)
  - [x] 6b. On stage button click: `document.getElementById('stage-N').scrollIntoView({ behavior: 'smooth', block: 'start' })`
  - [x] 6c. If auto-scroll is playing: pause auto-scroll on click (AC6)
  - [x] 6d. User can resume auto-scroll by pressing play again
  - [x] 6e. Update active stage indicator when user clicks a button

## Dev Notes

### Key Files
- **Teleprompter:** `mentoria-main/components/assets/TeleprompterStageMap.tsx`

### Unicode Issue Location
The user reported `\uD83D\uDDFA...` showing as raw text. This is a surrogate pair for the map emoji (🗺). Likely:
- The stage map/teleprompter toggle button uses this emoji as label
- It's stored as escaped unicode in the component or in the prompt output
- Fix: replace with literal emoji character or SVG icon

### Teleprompter Content Rendering
```tsx
// Current: all paragraphs get the same styling
{paragraphs.map(p => (
  <p className="text-2xl sm:text-3xl leading-relaxed text-white/90">{p}</p>
))}
```
Need to add classification:
```tsx
const isObservation = (text) =>
  /^\s*\*[^*]/.test(text) ||    // starts with italic
  /^\s*\(/.test(text) ||        // starts with tone annotation
  /^\s*\[/.test(text);          // starts with bracket instruction
```

### Auto-Scroll State
```tsx
const [isPlaying, setIsPlaying] = useState(false);
// On stage click:
setIsPlaying(false); // pause
scrollToStage(stageNumber); // smooth scroll
```

### Testing
- Check all buttons for broken unicode — stage map view + teleprompter controls
- Verify italic/tone lines render as muted observations
- Verify regular paragraphs render as prominent script text
- Click stage 1, 5, 10 — verify smooth scroll to correct position
- While auto-scrolling: click stage button — verify pause + scroll

## Risks
- False positive observation detection — some script text may legitimately start with `(` or `[` characters; tune regex carefully
- Auto-scroll pause/resume (AC6) assumes a play/pause button exists in the current component — verify before implementing

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-02 | 1.0 | Story drafted | @sm (River) |
| 2026-03-02 | 1.1 | PO validation: quality_gate @qa→@architect, removed coderabbit from tools, added risks section. Status Draft→Ready | @po (Pax) |
| 2026-03-02 | 1.2 | Implementation complete: unicode fix (4 locations + cleanSurrogates helper), observation styling (isObservation detector + dual CSS), clickable stage nav (pause + scroll + active update). Status Ready→InProgress | @dev (Dex) |

## Dev Agent Record
### Agent Model Used
Claude Opus 4.6 — YOLO mode
### Debug Log References
N/A — no errors encountered
### Completion Notes List
- **Part A (Unicode Fix):** Found 4 locations with raw surrogate pairs in JSX text content (lines 644, 717, 758, 768). Fixed by wrapping in JS string expressions (`{'\uD83C\uDFAC'}` etc.). Added `cleanSurrogates()` helper to strip broken surrogates from DB content — applied to stage titles during parsing and to teleprompter paragraph text during rendering.
- **Part B (Observation Distinction):** Added `isObservation()` detector function checking for 5 patterns: italic markdown (`*`), tone annotations (`(`), bracket instructions (`[`), underscore italic (`_`), and blockquotes (`>`). Teleprompter paragraphs now render with `text-lg italic text-white/40` for observations vs `text-2xl sm:text-3xl text-white/90` for script text.
- **Part C (Clickable Stage Navigation):** Modified `jumpToStage()` in TeleprompterView to: (1) pause auto-scroll via `setIsPlaying(false)`, (2) update active stage index immediately, (3) smooth scroll to stage divider. Added unique `id={teleprompter-stage-N}` to each stage container. User resumes via existing play button or spacebar.
### File List
- `mentoria-main/components/assets/TeleprompterStageMap.tsx` — all 3 parts implemented
