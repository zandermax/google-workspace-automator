# Phase 2: mail sorter design

## Goal

Design the sorter logic and operating model for the daily 100-email Gmail automation before implementation begins.

## Current status

- Project health is restored and the repo is compiling.
- The project is ready to move from infrastructure stabilization to actual sorting architecture.
- This step is intentionally design-only and should end with explicit user approval before implementation starts.

## Working rule

Only one design step is active at a time. No implementation begins until the current step is reviewed and confirmed.

## Step 1: define the sorting categories

Status: complete

Goal: decide what the system is sorting into.

Approved category map:

- Personal
  - Label: `Inbox / Personal`
  - Purpose: messages from friends, family, and personal contacts that should be kept visible and not auto-archived.

- Finance
  - Label: `Inbox / Finance`
  - Purpose: bills, banking updates, receipts, payment confirmations, and any financial notifications requiring review.

- Newsletters
  - Label: `Inbox / Newsletters`
  - Purpose: low-priority subscription content that should be kept out of the main inbox but remains easy to browse.

- Alerts
  - Label: `Inbox / Alerts`
  - Purpose: system notifications, updates, and service events that need to be visible but do not require immediate action.

- Follow-up
  - Label: `Inbox / Follow-up`
  - Purpose: emails that need a response or action, but are not urgent or personal enough to stay at the top of the inbox.

- Unknown / manual review
  - Label: `Inbox / Review`
  - Purpose: messages that do not match a known rule and should be reviewed by a human before a broader automation decision is made.

Notes:

- This first version is intentionally conservative and label-first.
- No category is set to auto-delete in this step.
- The main goal is to reduce noise without risking important mail.

Output: approved category map with label names and one-sentence rule definitions.

## Step 2: define the action model

Status: complete

Goal: decide exactly what happens to each category.

Approved action model:

- This version is intentionally conservative and label-first.
- No category auto-archives or auto-deletes in the first pass.
- The system should reduce inbox noise without risking important or time-sensitive mail.

Decision matrix:

| Category                | Default action                                   | Secondary action                                               | Safety rule                                                |
| ----------------------- | ------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Personal                | Apply `Inbox / Personal` label and leave visible | Star only if the sender is time-sensitive or actionable        | Never auto-archive or auto-delete                          |
| Finance                 | Apply `Inbox / Finance` label                    | Keep in inbox and flag for manual review                       | Never auto-archive or auto-delete                          |
| Newsletters             | Apply `Inbox / Newsletters` label                | Leave in inbox until the user reviews or a later rule is added | No destructive action in v1                                |
| Alerts                  | Apply `Inbox / Alerts` label                     | Leave visible in inbox                                         | No destructive action in v1                                |
| Follow-up               | Apply `Inbox / Follow-up` label                  | Star for attention or keep visible                             | Never auto-archive or auto-delete                          |
| Unknown / manual review | Apply `Inbox / Review` label                     | Leave in inbox for human judgment                              | Unknown mail should never be auto-processed without review |

Rule priority:

1. If the sender or subject clearly matches a known rule, apply that category.
2. If multiple rules match, pick the most specific and highest-priority match.
3. If the category is uncertain, fall back to `Inbox / Review`.
4. Never apply a destructive action in the first version.

Concrete behavior:

- Label-only actions are the default.
- Star or keep visible on follow-up and finance messages when the user may need to inspect them.
- Unknown or ambiguous mail goes to `Inbox / Review` rather than being auto-classified.
- Jukebox, bulk junk, or archive routing are postponed until the system is validated.

Output: approved action model with a conservative rule hierarchy and a clear review path for uncertain mail.

## Step 3: cap the daily processing model

Status: complete

Goal: keep the automation safe and bounded.

Approved processing model:

- This system follows the precedence established in [step-5-safe-sorter-architecture.md](./step-5-safe-sorter-architecture.md):
  1. process new unread inbox mail first
  2. then old inbox mail
  3. then archived mail only if room remains
- Initial daily throughput will be intentionally small and will scale up gradually.
- Intended first phase: 10–20 emails/day, then grow toward 50/day, then eventually toward the full target once the rules are validated.
- The long-term target remains 50/day, with the exact cap adjusted based on comfort and accuracy.

Rules:

- only process the inbox subset first; archive and broad old-mail processing stay out of the first rollout
- a run should have a strict max batch so it cannot overrun the schedule
- if a run is interrupted, it should resume from the next unprocessed items instead of reusing stale state
- the initial safe scope is narrower than the final design, but the precedence order stays the same

Output: approved daily run policy with a staged cap that starts small and expands over time.

## Step 4: define the review and logging model

Status: pending

Goal: keep the system auditable and debug-friendly.

Minimum logging:

- processed count
- category counts
- action counts
- unknown / skipped mail count
- any dry-run results

Review model:

- daily summary report
- per-category counts
- list of rules that matched
- a flag for manual review candidates

Output: a logging approach and summary report format.

## Step 5: validate the safe sorter architecture

Status: pending

Goal: review the detailed implementation blueprint before any code is written.

This step is intentionally backed by the architecture reference at [step-5-safe-sorter-architecture.md](./step-5-safe-sorter-architecture.md).

The reference doc is useful because it defines:

- fetch order and daily slot allocation
- AI classification contract and output schema
- action executor rules and recycle behavior
- digest format and unsubscribe workflow
- state tracking and trigger model
- dry-run safety checks

This should be treated as a technical blueprint for the implementation, not as a separate discordant plan.

Output: a confirmed architecture pass that is approved for coding.

## Step 6: define the first safe production rollout

Status: pending

Goal: prepare a conservative first deployment.

Recommended rollout:

1. dry-run mode for a few days
2. low-risk categories only
3. label-only actions before archive actions
4. gradually enable more aggressive routing

Output: a staged rollout checklist.

## Deliverable before implementation

Before implementation, we need:

- approved categories
- approved actions
- daily batching policy
- review/logging model
- safe architecture approval
- rollout plan

Once the architecture reference and the design steps are approved, we move into implementation with a small, reviewable first patch.
