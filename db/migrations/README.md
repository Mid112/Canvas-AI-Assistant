# Database migrations

`db/init/01_schema.sql` is applied automatically on **fresh** database containers. It reflects the current schema only.

If you have an **existing** local or shared database created before the `ta` role was removed, run the numbered migration scripts in order before relying on the updated schema. For local development, recreating the database (`docker compose down -v && docker compose up`) is also acceptable.

| Migration | Purpose |
|-----------|---------|
| `002_remove_ta_role.sql` | Reassigns legacy `ta` users to `instructor` and tightens the role check constraint |
