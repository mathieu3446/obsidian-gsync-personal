# Validation — 2026-10-22

- TypeScript strict compilation: passed.
- 26 automated tests: passed.
- npm audit: 0 known vulnerabilities in the selected dependency tree at verification time.
- Tests cover encryption roundtrip, tampering, wrong passphrase, scope restrictions, PKCE, revocation, path validation, folder binding, deleted-file restoration, simultaneous edits, binary conflict copies, unique conflict names, case collisions, partial listings, ETag preconditions, invalid OAuth state and secret-free persistence.

These tests use fake Obsidian and Google APIs. They do not authenticate a real Google account or exercise an actual mobile Obsidian WebView. The software should first be tested on disposable notes.

## Private-account acceptance test

1. Install into a copy of a vault; connect a new Google OAuth client with drive.file only.
2. Upload a disposable Markdown note; edit it locally and sync again (validates real Google ETag support).
3. Edit that same note in Drive and sync back; verify local recovery snapshots.
4. Connect a second test vault with the same OAuth client and exact folder ID; edit simultaneously on both devices and inspect conflict copies.
5. Rename/move the root folder in Drive; verify the ID binding still works. Trash it and verify synchronization stops without deleting local notes.
6. Restart Obsidian; verify no sync occurs until credentials are unlocked.
7. Revoke authorization; confirm Google removes it and that other devices using it must sign in again.
8. Test the browser-to-Obsidian callback on every intended mobile OS. If the app was killed, restart sign-in.

Any failed precondition must remain an error; do not remove concurrency guards to make a failing integration test pass.
