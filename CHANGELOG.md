# Changes from upstream 1.0.4

Version 2.0.0 is an intentionally incompatible personal fork with a separate Obsidian plugin ID, settings schema, OAuth callback action and dedicated Drive folder.

Restricted authorization; encrypted credential storage; explicit Google revocation; own static sign-in page; stable remote folder ID; no automatic deletion; content-based comparisons; conditional remote writes; atomic local text writes; conservative binary conflicts; recovery snapshots; path and listing validation; narrower default extensions; serialized state persistence; sanitized errors; reduced and updated build dependencies; regression tests and reproducible bundle checks.

Retained MIT license and original attribution. Removed upstream donation UI because this is a separate personal fork. Removed promises that every conflict and arbitrary existing Drive folder can be handled transparently.
