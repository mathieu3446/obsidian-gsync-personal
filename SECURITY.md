# Security model

This personal fork reduces accidental data loss and encrypts stored credentials. It is not certified malware-free and is not an end-to-end encrypted synchronization product.

- Google scope: full drive access, explicitly chosen for a dedicated account. The API token can manage all accessible Drive files; the plugin traverses only the bound folder. This discovers files created by the user or other apps. Use a dedicated OAuth client shared only between your own devices.
- Persistent credentials: AES-256-GCM with a 128-bit salt and 96-bit nonce; PBKDF2-SHA256, 600,000 iterations; passphrase never persisted. In-memory secrets cannot be protected against other code running inside Obsidian or a compromised OS.
- No deletes. A missing file is restored from the other side. A missing bound root aborts.
- Local text updates use Vault.process; binary remote changes are separate conflict copies.
- Remote updates read Drive v2 JSON metadata and require its strong ETag / If-Match on the v2 media PUT, plus a matching version. They preserve the existing MIME type and verify uploaded content by SHA-256 readback before checkpointing. No fallback to unconditional writes or to a v3 write using a v2 tag. Integration with real Drive still requires a private-account smoke test.
- Credentials, backups, configuration folders and hidden paths are excluded from sync. Allowed extensions can be changed by the user.
- Local recovery backups contain plaintext note contents and are not automatically purged.
- Static sign-in page: no analytics, third-party scripts, or token storage. GitHub Pages still receives HTTP connection metadata and the temporary authorization code in the initial URL.
- No background server, telemetry, shell execution or token-copy UI in the installed plugin.
- Development dependencies are pinned and scanned; the Obsidian runtime and future dependency advisories remain outside this snapshot's guarantee.

Never include client secrets, tokens, notes, data.json or full console dumps in public GitHub issues. Report reproducible non-sensitive symptoms only.
