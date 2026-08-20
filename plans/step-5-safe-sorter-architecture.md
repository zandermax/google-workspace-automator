# Step 5: Safe Sorter Architecture

## Status

Reference architecture — this document defines the implementation blueprint for the AI-assisted email sorter and should be used to validate the design before coding.

## Goal

Build a daily email triage pipeline that progressively clears the entire mailbox over time:

- Always processes all new unread inbox emails first (usually just a few per day).
- Then fills the remaining daily slot (up to 100 total) with a random sample of old unprocessed inbox emails.
- Once the inbox is fully cleared, switches to randomly sampling unprocessed archived emails.
- Uses Gemini Flash (via Google AI Studio free tier) to classify and summarize them.
- Applies Gmail labels and queues appropriate emails for auto-deletion via the existing recycle system.
- Emails a human-readable daily digest back to the account owner.
- Runs entirely on free Google cloud infrastructure — no local process, no paid service.

## Runtime

| Component          | Technology                                   | Cost                |
| ------------------ | -------------------------------------------- | ------------------- |
| Orchestration      | Google Apps Script (time-driven trigger)     | Free                |
| Gmail access       | GmailApp (native Apps Script)                | Free                |
| LLM classification | Gemini Flash via Google AI Studio API        | Free (1500 req/day) |
| Output             | GmailApp.sendEmail                           | Free                |
| State tracking     | Gmail labels (existing pattern in this repo) | Free                |

No external servers, cron jobs, or paid APIs required.

## Architecture layers

### 1. Fetch layer

The fetch strategy fills a fixed daily slot using a stateless priority cascade. No mode tracking needed — the queries naturally fall through in order.

**Daily slot:** `DAILY_LIMIT = 50` (top-level constant, easy to change)

**Selection cascade (stateless, runs each time, fills slots greedily):**

1. **New unread inbox** — `in:inbox is:unread -label:"🪄✨ Magic ✨🪄"` — take all unread, up to `DAILY_LIMIT`. If unread count equals or exceeds `DAILY_LIMIT`, stop here (do not run steps 2 or 3) and include an overflow warning in the digest.
2. **Old inbox (random)** — only if slots remain after step 1. `in:inbox -label:"🪄✨ Magic ✨🪄"` — fetch a pool of `remaining * 5`, shuffle, take `remaining`.
3. **Archived (random)** — only if slots remain after step 2. `in:anywhere -in:inbox -in:trash -in:spam -label:"🪄✨ Magic ✨🪄"` — same shuffle-and-fill.

**Overflow warning:** if new unread count ≥ `DAILY_LIMIT`, the digest opens with:

```
⚠️ High inbox volume: N new unread emails today (limit: 50).
   Only the first 50 were processed. Consider raising DAILY_LIMIT.
   Unprocessed new emails: [link to inbox]
```

**Random sampling:** Apps Script has no native random-order query. Fetch `DAILY_LIMIT * 5` threads per pool query (or fewer if not available), apply Fisher-Yates shuffle in memory, slice to the needed count.

**Configuration constant (top of `aiSorter.ts`):**

```ts
const DAILY_LIMIT = 50;
```

Use the existing `GmailQuery` builder from `src/Gmail/GmailQuery/index.ts`.

### 2. Extraction layer

For each thread, extract only the minimum needed for classification:

- Sender name and domain
- Subject line
- First 300 characters of the latest message body
- Whether there is an attachment (boolean)
- Thread date and age in days
- Estimated size in KB (sum of message sizes in the thread)

Do **not** send full email bodies to the LLM. Snippets only, to minimize token usage.

### 3. Classification layer (Gemini Flash)

Batch all extracted snippets into a single prompt per run. One API call per daily run, not one call per email.

**Categories:**

| Label                | Meaning                                                   | Action                                                        |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `triage/personal`    | Messages from real people the user knows                  | Label only — review manually via digest link                  |
| `triage/finance`     | Invoices, bank statements, payment confirmations          | Label only — review manually via digest link                  |
| `triage/govt`        | Government agencies, official bureaucratic correspondence | Label only — review manually via digest link                  |
| `triage/receipts`    | Purchase receipts and order confirmations                 | Label only — review manually via digest link                  |
| `triage/newsletters` | Subscriptions, marketing digests, announcements           | Label + `Auto-Recycle/7d` — trashed in 7 days if not reviewed |
| `triage/alerts`      | Automated system alerts, notifications, monitoring        | Label + `Auto-Recycle/7d` — trashed in 7 days if not reviewed |
| `triage/junk`        | Low-value, confidently disposable                         | Label + `Auto-Recycle/7d` — trashed in 7 days if not reviewed |

**Review mechanic:**

All categories link directly to their Gmail label view via URLs in the daily digest email. The user clicks a category in the digest to open that label in Gmail and confirm/rescue any thread before the 7-day window expires. No email is ever permanently deleted without a 7-day grace period (for recycle-tagged categories) or without manual action (for retain categories).

**Prompt contract:**

Input: a JSON array of `{ id, sender, subject, snippet, hasAttachment, ageInDays, sizeKb }` objects.

Expected output: a JSON array of `{ id, category, timeSensitive, actionRequired, summary, highlights, keyDetail }` objects.

- `category`: one of the labels above
- `timeSensitive`: boolean — does the value of this email depend on when it was sent? An old alert or promo is time-sensitive (now irrelevant); an old article, funny content, or reference material is not. This drives recycle behavior, not a quality judgment.
- `actionRequired`: boolean — does this email require a human decision or reply? Always false for time-sensitive stale emails.
- `summary`: one sentence (max 12 words) of what the email is actually about — content-first, not metadata
- `highlights`: array of up to 3 short strings — the most interesting or notable content items found, regardless of age. Examples: "React Server Components intro", "Alumni fundraiser ask", "10 CI failure alerts — all same job". Empty array if nothing notable.
- `keyDetail`: the single most operationally relevant detail if actionRequired — deadline, amount, event date, etc. Empty string otherwise.

**Examples of good highlight output:**

- React newsletter (old): `["React Server Components intro", "new concurrent features overview", "deprecated lifecycle methods"]`
- Career advice newsletter: `["advice now mostly superseded by LLMs", "networking tips still relevant"]`
- Webtoon: `["funny comic strip", "new episode available"]`
- Alumni newsletter: `["donation ask", "class reunion announcement"]`
- Alert emails (batch): `["10 alerts — all same failing CI job", "all older than 3 months"]`

**Time-sensitivity behavior:** time-sensitive emails that are also stale (LLM judges content has expired) skip their triage label and go directly to `Auto-Recycle/7d`. Time-insensitive emails always get their triage label regardless of age — their content may still be worth reading.

**Safety rule:** if the model returns an invalid or malformed response, the run aborts and logs an error — no partial application of labels.

### 4. Action executor

After receiving the classification response:

- Apply the corresponding `triage/*` label to each thread (create if missing), **unless time-sensitive and stale**.
- For time-sensitive stale threads: apply `Auto-Recycle/7d` only — no triage label.
- For `newsletters`, `alerts`, and `junk` categories (non-stale): also apply `Auto-Recycle/7d`.
- Time-insensitive emails always receive their triage label regardless of age.
- For all other categories: label only — the user reviews and acts manually.
- Mark each processed thread with the existing `Magic` label pattern via `labelProcessed`.
- Do **not** directly delete or archive any email. The recycle system handles deferred deletion.

**Action limits:**

- Maximum `DAILY_LIMIT` label operations per run (matches the fetch cap).
- If the limit would be exceeded, process the first N and stop — log a warning.

### 5. Digest layer

After the run, send one summary email to the account owner.

**Subject:** `📬 Daily Email Digest — [date]`

**Body structure:**

```
📬 Daily Email Digest — [date]
Processed: N / 50 | Action needed: N | Auto-recycling: N | Space freed: X MB

🗄️ Storage
- Gmail used: X GB / 15 GB  (▼ freed X MB today)
- Drive free: X GB
- Estimated MB queued for recycle this run: X MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ ACTION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[sender] · [relative age] · [sizeKb]
[subject]
→ [summary]
   • [highlight 1]
   • [highlight 2]
   ⏰ [keyDetail if present]
   ⛓️‍💥 Unsubscribe  ← only shown when an unsubscribe mechanism was found

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 PERSONAL  (N)  → [label URL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[sender] · [age] · [sizeKb]
[subject]
→ [summary]
   • [highlight 1]
   • [highlight 2]
   ⛓️‍💥 Unsubscribe  ← only shown when actionable

[one section per non-empty category, in priority order:
 personal → finance → govt → receipts → newsletters → alerts → junk]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕰️ RECYCLING IN 7 DAYS  (N · X MB total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[sender] · [age] · [category] · [sizeKb]
[subject]
→ [summary]
   • [highlight 1]  ← still shown even if stale — content may still be interesting
   ⛓️‍💥 Unsubscribe  ← only shown when actionable

[shown last; rescue any thread by removing the Auto-Recycle/7d label]
```

Plain text with UTF-8 separators. Gmail renders this cleanly on mobile and desktop.

The goal: read top-to-bottom and decide per email whether it's worth opening, without leaving the digest. Highlights give you content signal even for old emails — e.g. an old newsletter might have a still-relevant article worth saving.

**Per-entry content:** each entry includes summary, highlights, size, and optionally `⛓️‍💥 Unsubscribe` — only when an actionable unsubscribe mechanism was found.

**Quota and cleanup stats** shown in the header:

- Gmail used / total quota
- Drive free space
- Estimated MB queued for recycle this run
- `Processed: N / DAILY_LIMIT` where `DAILY_LIMIT = 50`

### 6. Unsubscribe support

#### Rendering rules

- If an unsubscribe mechanism is found, always show exactly: `⛓️‍💥 Unsubscribe`
- If no mechanism exists, show nothing.
- For both URL and `mailto:` variants, the visible link text is always `Unsubscribe`.

#### Header parsing

- Parse `List-Unsubscribe` and `List-Unsubscribe-Post` from message headers.
- Prefer HTTPS URL if present; fallback to `mailto:`.

#### POST-only one-click flow

When `List-Unsubscribe-Post: List-Unsubscribe=One-Click` is present and no directly usable URL link exists:

- Generate a signed one-time link in the digest:
  - text: `⛓️‍💥 Unsubscribe`
  - href: Apps Script Web App endpoint with tokenized params
- Endpoint verifies signature + expiry + message identity.
- Endpoint performs the required POST to the provider's unsubscribe endpoint.
- Endpoint returns a simple success/failure page.

#### Security requirements for unsubscribe links

- HMAC-signed tokens (secret stored in Script Properties)
- Short expiry (e.g. 7 days)
- Nonce/replay protection (store used token IDs)
- Only allow known HTTPS unsubscribe domains parsed from the header
- Log every unsubscribe attempt and result

### 7. Logging and error handling

- Use `Logger.log` for all decisions (available in Apps Script execution logs).
- On any LLM API error: abort the action phase, log the raw response, send a short error digest instead.
- On Gmail quota error: stop processing and log how many threads were completed.
- Never silently swallow errors.

## State management

Processed-thread state is tracked via Gmail labels (existing pattern). No external database required. The `labelProcessed` action from `src/Gmail/actions/labelAsProcessed.ts` handles this.

A new source script entry `'Gmail-AI-Sorter'` will be added to the `SOURCE_SCRIPTS` list and emoji map.

## Trigger

- Time-driven trigger: daily, scheduled for early morning (e.g. 06:00).
- Created via the existing `triggerFactory` pattern in `src/_t/triggerFactory.ts`.

## Dry-run mode

Before going live, the system should support a `DRY_RUN = true` constant:

- Classification still runs (LLM still called).
- No labels applied, no archive actions taken.
- Digest is still sent, marked as `[DRY RUN]`.
- This lets the user review categorization accuracy before trusting the live actions.

## New files to create

| File                                    | Purpose                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `src/_s/Gmail/aiSorter.ts`              | Top-level entrypoint for the daily sort run                       |
| `src/Gmail/GeminiClient.ts`             | Thin wrapper for calling the Gemini Flash API via `UrlFetchApp`   |
| `src/Gmail/actions/applyTriageLabel.ts` | Apply a triage label to a thread                                  |
| `src/Gmail/StorageStats.ts`             | Fetch Gmail quota usage and Drive free space via Apps Script APIs |
| `src/Gmail/actions/sendDigest.ts`       | Compose and send the daily digest email                           |
| `src/types/Gmail/triage.ts`             | TypeScript types for categories, classification result, digest    |

## Open questions (resolved)

- LLM: Gemini Flash via Google AI Studio (free tier) ✅
- Runtime: Apps Script time-driven trigger (no local process) ✅
- Output: digest email back to account owner ✅
- Destructive actions: archive only, no delete ✅
- State: Gmail labels (existing pattern) ✅

## Open questions (still pending)

1. Which personal email addresses / domains should always be routed to `triage/personal` as a priority rule (pre-LLM)?
2. Should the `triage/govt` category eventually feed the paperwork autopilot pipeline described in the broader personal admin OS plan?
3. What is the acceptable error rate for miscategorization before switching from dry-run to live?

## Non-goals for this step

- Building a UI for reviewing categories.
- Adding photo or Drive file scanning (separate step).
- Calendar or spreadsheet integration (separate step).
- Full paperwork OCR pipeline (separate step).

## Dependencies

- Step 3 (toolchain modernization) must be complete before implementing — the build needs to compile cleanly.
- Step 4 (Gmail query safety audit) must be complete — paging and reprocessing risks must be resolved first.

## Next action

Once steps 3 and 4 are confirmed complete, implement `GeminiClient.ts` first and verify the API key flow and response shape before building the rest of the sorter.
