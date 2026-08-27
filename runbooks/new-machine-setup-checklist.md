# New-machine setup checklist

This is the setup and deployment checklist for a fresh machine before this repo can be connected, built, and deployed.

## 1. Install required local tooling

- Install Node.js LTS and npm if they are not already present.
- Confirm the toolchain works:
  - node --version
  - npm --version
- Install the Apps Script deploy tool:
  - npm install -g @google/clasp

Notes:

- This is the main local tool needed for the one-time Google auth setup.
- The goal is to do the Google auth once, then move the credential into GitHub Actions so the machine does not need long-lived secrets.

## 2. Perform the one-time Google Apps Script auth

This is the only step that needs a Google login.

### Option A: create a new Apps Script project

- Run:
  - clasp login
  - clasp create --title "Google Workspace Automator" --type standalone

### Option B: connect to an existing Apps Script project

- Copy the script ID from Apps Script.
- Run:
  - clasp login
  - clasp clone <script-id>

This sets up the local Apps Script auth and creates the .clasprc.json and .clasp.json files in the repo context.

## 3. Save the auth into GitHub secrets

After the one-time auth completes:

- Copy the contents of the local .clasprc.json file.
- Add a GitHub repository secret named:
  - CLASPRC_JSON
- Add another secret for the script ID:
  - SCRIPT_ID

This is the secure pattern that avoids storing deployment secrets on the machine.

## 4. Clone the repository on the new machine

- Clone the repo to the new machine.
- Open a terminal in the repo root.

## 5. Install project dependencies

- Run:
  - npm install

This installs the repo's TypeScript, linting, build, and deployment dependencies.

## 6. Validate the repo before deployment

- Run:
  - npm run build

Expected result:

- Project compiles without TypeScript errors.

Optional sanity checks:

- npm run format
- npm run lint

## 7. Set up GitHub Actions deployment

Create a workflow that runs on pushes to main.

The workflow should:

- checkout the repo
- install Node
- run npm ci
- run npm run build
- reconstruct the clasp auth file from the GitHub secret
- write .clasp.json using the SCRIPT_ID secret
- deploy with npm run push or npx clasp push

Example flow:

```yaml
name: Deploy Apps Script

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Write clasp auth
        run: |
          mkdir -p ~/.config
          printf '%s' '${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json
          echo '{"scriptId":"${{ secrets.SCRIPT_ID }}"}' > .clasp.json

      - name: Push to Apps Script
        run: npm run push
```

## 8. Confirm the deployment actually landed

- Open the connected Apps Script project in the browser.
- Confirm the runtime files are present.
- Confirm the trigger registration files are present and the script functions match.
- Confirm the script is authorized for the account being used.

## 9. Deployment gate for the mail sorter

Only proceed after the architecture and rollout gates are approved:

- Step 5 safe sorter architecture is signed off.
- Step 6 rollout plan is approved.
- The first run is dry-run only.
- Initial rollout is label-only and low-volume.
- No destructive action is allowed in v1.

## 10. First safe live rollout sequence

Recommended order:

1. Dry-run for a few days
2. Low-risk categories only
3. Label-only actions only
4. Check digest output and review queue
5. Increase volume gradually
6. Only then consider recycle or archive behavior

## 11. Final ready-to-go checklist

- Node installed
- npm installed
- clasp installed
- Google account logged in once for Apps Script auth
- .clasprc.json generated once for the Google account
- CLASPRC_JSON secret added to GitHub
- SCRIPT_ID secret added to GitHub
- repo pushed to GitHub with deploy workflow enabled
- npm install completed
- npm run build passes
- GitHub Actions deploy succeeds
- architecture approval complete
- dry-run and label-first rollout approved

This is the secure path for fresh-machine setup and GitHub-driven Apps Script deployment without storing secrets locally.
