# Digest One-Click Actions (Delete / Archive / Mark Read)

## Plan Metadata

- Status: proposed (not started)
- Mode: interactive
- Canonical location: docs/plans/digest-oneclick-actions.md
- Last updated: 2026-09-11
- Goal: Let the daily digest email include per-item action links (delete, archive, mark read) that execute against the real Gmail thread when clicked, without requiring the user to open Gmail first.
- Success criteria:
  - Clicking an action link in the digest performs that action on the correct thread and shows a simple confirmation page.
  - Links cannot be replayed or reused by anyone who obtains the email later than intended (expiry), and cannot be guessed for other threads.
  - Destructive actions (delete) are never triggered by a bare link click alone — see "Prefetch risk" below.
  - No secrets (API keys, signing secret) are ever embedded in the email or client-visible URL.
- Constraints and assumptions:
  - Runtime stays 100% Google Apps Script; the existing `sendDigest`/`composeDigestHtml` pipeline is extended, not replaced.
  - This is additive to the current digest — plain-text fallback and the read-only "open thread" link shipped in the formatting pass are unaffected.

## Why this is a separate effort

Every other digest change so far is pure formatting: compose different text/HTML from data that's already produced by the existing sorter pipeline. Actions are different — they require a new *inbound* entry point (a deployed Web App that Gmail's link-opening browser can hit) and real authorization/abuse-prevention decisions. That's new attack surface, not a rendering tweak, so it gets its own design pass and explicit go-ahead before implementation.

## Proposed approach

1. **New Web App endpoint** (`doGet` in a new `src/_s/Gmail/digest-actions.ts`, wired into `appsscript.json` as a Web App deployment, `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS` since Gmail link clicks can't carry auth).
2. **Signed, expiring action tokens** — each action link encodes `{ threadId, action, exp }` and an HMAC-SHA256 signature computed with a secret stored in Script Properties (`ACTION_LINK_SECRET`, generated once, never logged or emailed). `doGet` recomputes the HMAC and rejects on mismatch or if `exp` has passed (recommend 72h, comfortably past the digest's relevance window but bounded).
3. **Confirmation step before mutating** — `doGet` on first click renders a small HTML confirmation page ("Delete this thread? [Confirm]") with a same-origin `<form method="post">` (or a second signed link) that performs the actual mutation on `doPost`/the confirmed `doGet`. The action never executes on the first, unconfirmed GET.
   - This matters because mail clients, antivirus tools, and Google's own link-checking proxies routinely pre-fetch URLs in HTML emails via GET requests to scan for phishing/malware. A bare `doGet?action=delete&...` link would get "clicked" by a scanner before the user ever sees the email, silently deleting mail. The confirmation click closes that gap for delete/archive; mark-as-read is low-risk enough it could skip confirmation if desired.
4. **Reuse existing execution primitives** — `GmailApp.getThreadById(threadId)` + `.moveToTrash()` / `.moveToArchive()` / `.markRead()`, following the same resolve-thread pattern already in `src/Gmail/actionExecutor.ts`.
5. **Digest wiring** — `composeDigestHtml` gains an `actionLinks` option that, per item, appends small "Archive · Mark read · Delete" links built from a `buildActionLink(threadId, action)` helper (mirrors today's `buildThreadLink`).

## Open questions to resolve before implementation

- Token expiry window (72h suggested) and whether tokens should be single-use (would need a persisted "used" set, e.g. in Script Properties or a Sheet, adding statefulness).
- Whether "mark read" (non-destructive, easily reversible) should skip the confirmation step for a snappier one-click feel, while delete/archive keep it.
- Whether archived/deleted threads should be reflected back into the next day's digest (e.g. skip re-listing) or if that's already handled by existing label state.

## Next step

Not started. Revisit via the brainstorming workflow when ready to build — the open questions above should be settled as part of that design, then it flows into a normal implementation plan.
