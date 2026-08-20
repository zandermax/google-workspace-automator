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

Status: pending

Goal: decide exactly what happens to each category.

Possible actions:

- apply a label only
- apply a label and archive
- star or snooze for follow-up
- leave in inbox for human review
- move to trash only for known junk patterns

Rules to define:

- rule priority order
- when multiple rules match
- how to handle unknown mail
- whether uncertain mail should be quarantined

Output: a decision matrix for category -> action -> safety rule.

## Step 3: cap the daily processing model

Status: pending

Goal: keep the automation safe and bounded.

Constraints to define:

- daily target: 100 emails/day
- max threads per run
- how to choose newest vs oldest unread mail
- whether to process only unread mail or both read/unread
- what to do when a run is interrupted or partially processed

Output: the daily run policy and hard limits.

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
