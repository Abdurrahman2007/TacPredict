# Isolated PostgreSQL security regression runtimes

From the application root:

```sh
npm --prefix protocol run test:security-sql
npm --prefix protocol run test:security-postgres
```

The first command installs the separately locked test-only dependencies and runs the PGlite suite. The second hydrates the pinned embedded PostgreSQL package's runtime symlinks through its official postinstall script, then starts **PostgreSQL 17.9** in a private temporary directory. The packaging version is `17.9.0-beta.17`; the actual server identifies itself as PostgreSQL 17.9. This is an optional Linux x64 **test-only** binary, never an application/production dependency.

Native tests use a private Unix socket, `listen_addresses=''`, host auth rejected and a fresh local test database per fixture. No TCP listener, DATABASE_URL, Supabase endpoint, production credentials, `.env`, RPC, wallet or EVM are accepted. Roles are local to the disposable test cluster. A failed fixture closes connections; the runner stops the server and removes the temporary directory after success/failure. A missing/unsupported runtime fails closed; there is no external database fallback.

The two SQL files under `docs/audit/proposals` execute only in these synthetic test databases. They are not queued production migrations and CI must not apply them anywhere else. The native suite adds independent-session replay races, rollback/retry, canonical conflicts, parent/lease row-lock contention and mid-batch atomic rollback. The same own/other/unverified/revoked role-isolation assertions run against both engines.

Fixtures are source-derived, not a clone of all live production objects. Real staging with current approved production metadata, provider/wallet/indexer E2E, independent review and explicit rollout approval remain separate release gates. Never copy the synthetic fixture rows into the existing Supabase project.
