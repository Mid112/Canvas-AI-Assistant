# Canvas token uniqueness

Canvas token reuse is prevented per Canvas institution, not globally across
unrelated Canvas servers. The database stores only a Fernet-encrypted token
and a versioned keyed HMAC fingerprint. The unique partial index covers the
institution URL and fingerprint together.

For deployment, ensure migrations `045_unique_canvas_token_fingerprint.sql`
and `046_scope_canvas_token_fingerprint_to_institution.sql` are both applied.
The backend migration runner applies them automatically to an existing
database; a fresh database receives both from `db/init/01_schema.sql`.

Local Docker aliases (`localhost`, `127.0.0.1`, and `canvas_lms`) are treated as
one institution and new connections are stored under a canonical URL. Existing
legacy spellings are checked during token registration and upgraded safely
when possible.

If legacy connections already share a token, deployment does not expose or
copy the plaintext into SQL. The application detects the conflict during a
connection attempt; administrators should force one affected instructor to
reconnect with a different Canvas token. Key rotation requires an application
maintenance job to decrypt and recompute every fingerprint before normal writes
resume.
