# Validation — 2026-10-24

- TypeScript strict compilation: passed.
- 65 automated tests: passed.
- npm audit: 0 known vulnerabilities in the selected dependency tree at verification time.
- Tests cover encryption roundtrip, tampering, wrong passphrase, scope validation, PKCE, revocation, path validation, folder binding, deleted-file restoration, simultaneous edits, binary conflict copies, unique conflict names, case collisions, partial listings, ETag preconditions, invalid OAuth state and secret-free persistence.

These tests use fake Obsidian and Google APIs. They do not authenticate a real Google account or exercise an actual mobile Obsidian WebView. The software should first be tested on disposable notes.

2.1.0 adds regression coverage for explicit permission migration, accepted full grants, rejected limited grants, encrypted migration metadata and folder-bound discovery.

## 2.1.1 regression coverage

Seven new tests cover a JSON v2 ETag with no HTTP ETag header, Markdown link changes, weak/malformed validators, stale/missing versions and trashed files, ambiguous write responses, readback corruption or a new remote version, a simulated two-device 412 race, and two successive edits through the real DriveClient with mocked transport. The two pre-existing ETag tests now use v2 JSON fixtures. These are not live Google API tests.

References: [v2 File metadata and ETag](https://developers.google.com/workspace/drive/api/reference/rest/v2/files), [v2 media update endpoint](https://developers.google.com/workspace/drive/api/reference/rest/v2/files/update), [v2/v3 differences](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference).

## 2.2.0 regression coverage

23 additional tests cover repeated and bulk local deletion, two-device propagation, edit/delete races in both directions, stale offline copies after trash purge or state loss, unknown files, inaccessible/moved/restored originals, local/remote renames, snapshot failure, edits during local trash preparation, recovery after a failed journal write, conditional v2 trash including 412 and parent changes, destination migration and old-client marker incompatibility, missing/invalid journal refusal, append-only metadata-only markers and concurrent journals, and vault readiness.

These are mocked transport/Obsidian tests, not a claim of live API validation. The previous missing-file test now verifies local preservation without unproven resurrection.

## Private-account acceptance test

1. Install into a copy of a vault; connect a new Google OAuth client with full drive permission.
2. Upload a disposable Markdown note; add a [[wikilink]] locally and sync again. Confirm the exact content on Drive, edit again and repeat (validates the actual v2 update and readback).
3. Edit that same note in Drive and sync back; verify local recovery snapshots.
4. Connect a second test vault with the same OAuth client and exact folder ID; edit simultaneously on both devices and inspect conflict copies.
5. Update ALL devices to 2.2.0 with sync intervals disabled before the first sync. Preserve data.json and the bound ID. Confirm the deletion-history folder exists; old 2.1.x must refuse marker 2. Create and synchronize disposable notes on both devices, delete several on PC, sync both twice, and verify no resurrection. Repeat from iPhone and by trashing an original in Drive. Verify Drive trash, vault .trash, and recovery snapshots.
6. Test edit-versus-delete while one device is offline; ensure the edit survives in the restored note or a conflict copy. Restore the original in Drive trash and verify intentional restoration. Never test by permanently purging valuable files. Deletion journal metadata must not appear as notes.
7. Rename/move the root folder in Drive; verify the ID binding still works. Trash it and verify synchronization stops without deleting local notes.
8. Restart Obsidian; verify no sync occurs until credentials are unlocked.
9. Revoke authorization; confirm Google removes it and that other devices using it must sign in again.
10. Test the browser-to-Obsidian callback on every intended mobile OS. If the app was killed, restart sign-in.

Any failed precondition must remain an error; do not remove concurrency guards to make a failing integration test pass.

2.0.1: credential operation exclusion, unload during setup, concurrent unbound sync refusal and long conflict names are covered by four additional tests. Root initialization must be performed explicitly on the first device; other devices reuse the folder ID.
