# Continuation: public-read coalescing and retained CI evidence

Review-only follow-up to commit `e9b6a451b98fbe2a7c87c11a15677b0ce734d625` in Draft PR #26. No contract/deployment, production configuration, secret, migration, grant, market activation, trade submission or UI layout change.

## Prior commit independently checked in GitHub CI

Both jobs completed successfully on the prior commit:

- Virtual local suite, compilation, typecheck, scoped lint and build: https://github.com/Abdurrahman2007/TacPredict/actions/runs/40371125540/job/121741826368
- Existing protocol workflow: https://github.com/Abdurrahman2007/TacPredict/actions/runs/40371125655/job/121741827395

Workflow success is not production validation. The broader optional regression sweep still has the documented baseline Rewards-header assertion and full-repository lint is not clean. The local `.log` names in VALIDATION.md/validation.json refer to workspace captures, which were excluded from the GitHub commit by ignore rules; do not treat those names as downloadable repository files. The committed JSON transaction evidence, oracle probe, visual measurements and the CI logs above are available. This follow-up configures CI to preserve future local evidence as downloadable artifacts instead.

## Safe backend improvement

A bounded, server-only in-flight coalescer shares simultaneous public catalogue reads within one server isolate. Identical requests reuse the same running authoritative read instead of repeating all chain/checkpoint/policy/event queries for every overlapping caller.

- No fulfilled-result cache, TTL, stale fallback or fabricated quotes. After completion/failure the next request performs a new read.
- Different deployment config, RPC endpoint or database project has a distinct identity; credentials in identities are never logged or returned.
- At most four active identities per isolate; overload fails closed. Failed reads reject all waiting callers and free capacity.
- Only public catalogue data uses this helper. No wallet/account data, authentication, grants, trade preparation, nonce, receipt checks or transaction submission is cached/coalesced.
- This is not global/shared caching across Cloudflare isolates and does not solve sustained RPC quotas, provider cost, rate limiting or the fast-oracle launch blocker.

Seven focused tests cover burst deduplication, fresh subsequent reads, error eviction, deployment/RPC/database isolation, collision-free identities, bounds and invalid input. They are new tests, not part of the prior 71-pass result. The follow-up needs its own CI result; do not describe the previous green jobs as validation of new code.

## CI evidence

The review workflow now retains compile/test/typecheck/scoped-lint/build text output plus both old/new local-engine receipt JSONs for 14 days. The workflow still uses only disposable local EVM/PostgreSQL and public dummy configuration with read-only GitHub permissions. No signing key, real network deployment, funds, production service credential or trading activation is introduced. Artifacts are diagnostic evidence, not Base transaction receipts.

The local workspace execution tool returned an infrastructure error during this continuation, so this follow-up is submitted for remote CI validation rather than claiming a new local run. See the current PR checks/artifacts for its actual result. Fast verifiable source selection/integration, independent economic/security review, real testnet/staging wallet/DB/operator E2E and explicit production approvals remain required.
