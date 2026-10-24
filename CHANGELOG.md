# Changes from upstream 1.0.4

Version 2.0.0 is an intentionally incompatible personal fork with a separate Obsidian plugin ID, settings schema, OAuth callback action and dedicated Drive folder.

Restricted authorization; encrypted credential storage; explicit Google revocation; own static sign-in page; stable remote folder ID; no automatic deletion; content-based comparisons; conditional remote writes; atomic local text writes; conservative binary conflicts; recovery snapshots; path and listing validation; narrower default extensions; serialized state persistence; sanitized errors; reduced and updated build dependencies; regression tests and reproducible bundle checks.

Retained MIT license and original attribution. Removed upstream donation UI because this is a separate personal fork. Removed promises that every conflict and arbitrary existing Drive folder can be handled transparently.

## 2.0.1

Serialize credential setup/unlock against lock and sync; discard credential setup after unload. Bound destination required before sync; explicit uniquely named destination creation on first device. Shorten conflict basenames to retain valid remote filenames. Four regression tests added (30 total).

## 2.1.0

Use full Google Drive authorization at user request to discover files added manually or by other apps inside the bound folder. Keep AES-GCM credentials, passphrase handling, folder binding and no automatic deletion. Existing tokens require explicit reauthorization; no secret-storage or automatic-unlock change. Sign in again is available for connected accounts.

## 2.1.1

Fix updates of existing files failing because Drive v3 metadata supplies no ETag. Read the JSON metadata ETag using v2 and perform the conditional media PUT on the v2 upload endpoint; never mix a v2 ETag with v3 uploads. Reject stale versions and absent, weak or malformed validators. Retain the current MIME type, create a new revision, use the upload response version and verify the uploaded bytes by downloading again before checkpointing. Seven additional regression tests (42 total), including consecutive Markdown link edits and a two-client race. No credential schema or OAuth permission changes from 2.1.0.

## 2.2.0

Synchronize previously observed deletions through Drive and vault trash with recovery snapshots. Verify versions, parent and strong v2 ETag before trashing Drive files. Preserve concurrent edits; do not infer a deletion from an unknown file, permission failure, unproven 404 or move outside the bound destination. Add an append-only metadata-only deletion journal, merge concurrent journals, refuse missing/corrupt history, and prevent identical stale uploads after comparison-state loss. Migrate destination marker to 2 so older clients fail closed; wait for vault layout readiness before sync. Empty directories remain. 65 mocked tests pass; live two-device acceptance remains necessary. No OAuth scope or credential schema changes.
