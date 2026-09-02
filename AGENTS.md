# Repository Agent Summary

## Deployed Apps Script snapshot

The `.remote/` directory is an ignored local snapshot of the Apps Script project currently deployed to GAS. It is not source code and must not be committed or included in the normal build.

To refresh it:

1. Install `@google/clasp` and run `clasp login` once.
2. Create local Apps Script linkage with `clasp clone <script-id>` so `.clasp.json` exists in the repository root.
3. Run `npm run pull:remote`.
4. Inspect `.remote/metadata.json` for the pull timestamp, script ID, local commit, and result.

The pull command copies only the script ID into `.remote/.clasp.json`; it does not copy credentials. `clasp` reads authentication from the user's normal local clasp configuration.

After the first successful pull, inspect the actual generated files before adding tests under `tests/remote/`. Those tests should distinguish static deployed-source checks, mocked Apps Script behavior, and behavior that can only be verified by executing inside GAS.

## Source and deployment boundaries

- `src/` is the editable TypeScript source.
- `dist/` is generated build output and the payload pushed by `npm run push`.
- `.remote/` is the fetched deployed snapshot and is never a build input.
- `tests/remote/` is reserved for tests derived from the first real remote snapshot.
