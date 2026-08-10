# Canvas token uniqueness

Canvas token reuse is prevented per Canvas institution, not globally across
unrelated Canvas servers. The database stores only a Fernet-encrypted token
and a versioned keyed HMAC fingerprint. The unique partial index covers the
institution URL and fingerprint together.

For deployment, ensure migrations `045_unique_canvas_token_fingerprint.sql`,
`046_scope_canvas_token_fingerprint_to_institution.sql`, and
`047_canonicalize_canvas_connection_urls.sql` are applied in order. The
backend migration runner applies them automatically to an existing database;
a fresh database receives all three from `db/init/01_schema.sql`. Migration
047 stops rather than silently choosing an owner if existing URL
canonicalization would create a duplicate.

Local Docker aliases (`localhost`, `127.0.0.1`, and `canvas_lms`) are treated as
one institution. Scheme and hostname casing are also normalized, and new
connections are stored under a canonical URL. Existing legacy spellings are
normalized by migration 047; legacy token fingerprints are checked during
registration and upgraded safely when possible.

If legacy connections already share a token, deployment does not expose or
copy the plaintext into SQL. The application detects the conflict during a
connection attempt; administrators should force one affected instructor to
reconnect with a different Canvas token. Key rotation requires an application
maintenance job to decrypt and recompute every fingerprint before normal writes
resume.
