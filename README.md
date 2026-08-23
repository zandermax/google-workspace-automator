# Google Workspace Automator

![Deploy Apps Script](https://github.com/zandermax/google-workspace-automator/actions/workflows/deploy-apps-script.yml/badge.svg)

A small TypeScript project that automates routine Google Workspace cleanup and triage tasks with Google Apps Script. The code is designed to run inside Apps Script, then be built and pushed to a connected Google Script project via `clasp`.

This repository is intentionally structured so both humans and autonomous coding agents can quickly answer three questions:

- Where is the actual runtime logic?
- Which files define automation triggers?
- How do I build and deploy the project safely?

---

## What this project does

The current automations are Gmail and Drive cleanup jobs, including things like:

- removing old unread mail, invites, promos, update emails, and bot SMS messages
- recycling or labeling processed mail
- deleting untitled or tiny Drive files
- creating scheduled trigger-based jobs for recurring maintenance

The project is built around Google Apps Script and uses `ScriptApp.newTrigger(...)` to register time-based workflows.

---

## Repo map

```text
.
├── README.md                     # This guide
├── package.json                  # Build and deploy scripts
├── tsconfig.json                 # TypeScript config for source validation
├── .gitignore                    # Ignores local build and clasp metadata
├── plans/                        # design docs and planning notes
├── src/
│   ├── _s/                       # Apps Script runtime functions (actual logic)
│   │   ├── Drive/                # Drive-related automation scripts
│   │   └── Gmail/                # Gmail automation scripts
│   │
│   ├── _t/                       # Trigger registration files
│   │   ├── Drive/
│   │   └── Gmail/
│   │
│   ├── common/                   # shared utilities and common query mechanics
│   ├── Drive/                    # Drive-specific abstractions and helpers
│   ├── Gmail/                    # Gmail query helpers and shared Gmail logic
│   ├── helpers/                  # generic support utilities
│   ├── sorter/                   # experimental mail sorting logic
│   └── types/                    # shared TypeScript type definitions
├── tests/
│   └── sorter-phase1.test.mjs    # Node-based regression tests for sorter behavior
└── dist/                         # generated build output, pushed to Apps Script via clasp
```

### Main runtime files

- `src/_s/Gmail/*.ts` — the actual Gmail cleanup functions that execute in Apps Script
- `src/_s/Drive/*.ts` — Drive automation functions
- `src/_t/*_trigger.ts` — trigger wrapper functions that call `twiceDailyTrigger`, `dailyTrigger`, etc.
- `src/_s/Gmail/index.ts` — central trigger function registry and type definitions
- `src/Gmail/GmailQuery/*` — Gmail search/query builders used by the automation jobs
- `src/Drive/...` — Drive query and folder helpers

### Trigger conventions

Trigger files live under `src/_t` and usually follow this pattern:

```ts
import { dailyTrigger } from '../triggerFactory';

export const someJobTrigger = () => dailyTrigger('someJob');
```

The actual script function name must match the Apps Script function being registered, and it should be declared in `src/_s/Gmail/index.ts` or the relevant runtime registry.

---

## Initial setup

This project is designed to deploy to Google Apps Script through `clasp`, and the preferred secure workflow is:

- do the Google login once on a machine
- store the Apps Script auth and script ID in GitHub Secrets
- let GitHub Actions deploy on push
- keep secrets off your local machine

### One-time Google auth

Run these commands once to authorize the Google account:

```bash
npm install -g @google/clasp
clasp login
```

If this is a new Apps Script project:

```bash
clasp create --title "Google Workspace Automator" --type standalone
```

If this is an existing Apps Script project:

```bash
clasp clone <script-id>
```

This creates the local Apps Script auth files and links the repo to the correct Google account.

### Store credentials in GitHub Secrets

After the one-time auth succeeds:

- copy the contents of `.clasprc.json`
- store it as a GitHub repository secret named `CLASPRC_JSON`
- store the Apps Script script ID as `SCRIPT_ID`

This is the secure pattern for a new machine or a shared workflow. You are not keeping deployment secrets on a developer machine after setup.

The repository includes a deployment workflow that fails early if either of these secrets is missing.

### GitHub Actions deployment

The repo can deploy on every push to the main branch with a workflow like this:

```yaml
name: Deploy Apps Script

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Validate deployment secrets
        shell: bash
        env:
          CLASPRC_JSON: ${{ secrets.CLASPRC_JSON }}
          SCRIPT_ID: ${{ secrets.SCRIPT_ID }}
        run: |
          if [[ -z "$CLASPRC_JSON" ]]; then
            echo "Missing required secret: CLASPRC_JSON"
            exit 1
          fi
          if [[ -z "$SCRIPT_ID" ]]; then
            echo "Missing required secret: SCRIPT_ID"
            exit 1
          fi

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install clasp
        run: npm install -g @google/clasp

      - name: Write clasp auth
        run: |
          mkdir -p ~/.config
          cat <<'EOF' > ~/.clasprc.json
          ${{ secrets.CLASPRC_JSON }}
          EOF
          printf '%s' '{"scriptId":"${{ secrets.SCRIPT_ID }}"}' > .clasp.json

      - name: Build and deploy to Apps Script
        run: npm run push
```

This keeps the machine clean while still letting GitHub push the generated project to Apps Script.

### Required GitHub secrets

Before the workflow can run successfully, add these secrets in GitHub:

- `CLASPRC_JSON` — the contents of the local `.clasprc.json` generated by `clasp login`
- `SCRIPT_ID` — the Apps Script project ID from the Script settings page

If either secret is missing, the workflow exits immediately with a clear error instead of failing later in the deploy step.

### Local workflow

### Install dependencies

```bash
npm install
```

### Sanity-check the project

```bash
npm run build
```

This validates the TypeScript sources and compiles the project into `dist/` using the repo's Babel + TypeScript pipeline.

### Lint and format

```bash
npm run format
npm run lint
```

The full deployment script also runs formatting and linting before pushing.

---

## Deployment to Google Apps Script

This project is set up to deploy via `clasp`.

### Deploy the current code

The repo already includes a deployment command:

```bash
npm run push
```

This script does the following:

1. removes stale generated files from `dist/`
2. formats the repo
3. lints the repo
4. builds the TypeScript sources into `dist/`
5. runs `clasp push` from inside `dist/`

That means the generated `dist` folder is the actual payload pushed to Google Apps Script.

> Important: do not edit generated files in `dist/` by hand. Treat it as build output only.

### Manual deploy flow

If you want to do it step by step:

```bash
npm run build
cd dist
clasp push
```

If the Apps Script project is already linked, this is the standard path for shipping changes.

---

## How to navigate this repo as an agent

When making changes, use this mental model:

- `src/_s/*` = what actually runs
- `src/_t/*` = trigger wiring
- `src/Gmail/*` and `src/Drive/*` = reusable logic and domain abstractions
- `src/common/*` = cross-cutting helpers
- `plans/*` = design rationale and long-term architecture notes
- `tests/*` = validation and regression checks

If you are adding a new automation:

1. create or update the runtime script under `src/_s/...`
2. add the trigger wrapper under `src/_t/...`
3. register the function in the relevant index or trigger registry
4. run `npm run build`
5. deploy with `npm run push`

If you are changing Gmail query behavior, start in `src/Gmail/GmailQuery/*` and related runtime files under `src/_s/Gmail/*`.

If you are working on Drive rules, look under `src/Drive/*` and `src/_s/Drive/*`.

---

## Practical conventions

- Prefer small, domain-specific script files instead of one giant monolith.
- Keep the Apps Script runtime functions in `src/_s` and keep trigger wrappers separate in `src/_t`.
- Use the shared query builders instead of hand-rolled Gmail search strings when possible.
- Keep generated build artifacts in `dist/` and avoid permanent edits there.
- Treat trigger registration as part of the deployment workflow, not just a local code detail.

---

## Useful commands

```bash
npm install
npm run build
npm run format
npm run lint
npm run push
```

---

## Notes for future work

The repository includes a mail-sorting design and roadmap under `plans/`, so there is an intentional split between the current operational cleanup automations and the next-generation email sorting system. When adding new behavior, check those plans first to avoid reintroducing conflicting patterns.

This repo is best thought of as a Google Apps Script automation codebase with a TypeScript build layer and a `clasp` deployment pipeline.
