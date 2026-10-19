# Isolated PostgreSQL security regression runtime

From the application root: `npm --prefix protocol run test:security-sql`.

This installs the separately locked PGlite test-only dependency, then runs `../supabase-security-sql.test.mjs`. No network/database credentials are consumed by the tests. PostgreSQL runs locally in WASM using synthetic fixtures; it does not connect to Supabase or an EVM. The two SQL files under `docs/audit/proposals` are executed only in this ephemeral test database. They are not production migrations and must not be applied by CI.

Real multi-connection PostgreSQL staging/race/reorg tests are a separate release requirement. Never point this fixture script at production or copy its synthetic rows into the application's existing database.
