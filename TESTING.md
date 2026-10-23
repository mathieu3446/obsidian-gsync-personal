# Validation — 2026-10-23

- TypeScript strict compilation: passed.
- 42 automated tests: passed.
- npm audit: 0 known vulnerabilities in the selected dependency tree at verification time.
- Tests cover encryption roundtrip, tampering, wrong passphrase, scope validation, PKCE, revocation, path validation, folder binding, deleted-file restoration, simultaneous edits, binary conflict copies, unique conflict names, case collisions, partial listings, ETag preconditions, invalid OAuth state and secret-free persistence.

These tests use fake Obsidian and Google APIs. They do not authenticate a real Google account or exercise an actual mobile Obsidian WebView. The software should first be tested on disposable notes.

2.1.0 adds regression coverage for explicit permission migration, accepted full grants, rejected limited grants, encrypted migration metadata and folder-bound discovery.

## 2.1.1 regression coverage

Seven new tests cover a JSON v2 ETag with no HTTP ETag header, Markdown link changes, weak/malformed validators, stale/missing versions and trashed files, ambiguous write responses, readback corruption or a new remote version, a simulated two-device 412 race, and two successive edits through the real DriveClient with mocked transport. The two pre-existing ETag tests now use v2 JSON fixtures. These are not live Google API tests.

References: [v2 File metadata and ETag](https://developers.google.com/workspace/drive/api/reference/rest/v2/files), [v2 media update endpoint](https://developers.google.com/workspace/drive/api/reference/rest/v2/files/update), [v2/v3 differences](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference).

## Private-account acceptance test

1. Install into a copy of a vault; connect a new Google OAuth client with full drive permission.
2. Upload a disposable Markdown note; add a [[wikilink]] locally and sync again. Confirm the exact content on Drive, edit again and repeat (validates the actual v2 update and readback).
3. Edit that same note in Drive and sync back; verify local recovery snapshots.
4. Connect a second test vault with the same OAuth client and exact folder ID; edit simultaneously on both devices and inspect conflict copies.
5. Rename/move the root folder in Drive; verify the ID binding still works. Trash it and verify synchronization stops without deleting local notes.
6. Restart Obsidian; verify no sync occurs until credentials are unlocked.
7. Revoke authorization; confirm Google removes it and that other devices using it must sign in again.
8. Test the browser-to-Obsidian callback on every intended mobile OS. If the app was killed, restart sign-in.

Any failed precondition must remain an error; do not remove concurrency guards to make a failing integration test pass.

2.0.1: credential operation exclusion, unload during setup, concurrent unbound sync refusal and long conflict names are covered by four additional tests. Root initialization must be performed explicitly on the first device; other devices reuse the folder ID.
