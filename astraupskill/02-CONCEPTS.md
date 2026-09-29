# Concepts: idempotent transitions

An idempotent status command can be repeated without changing state after the first successful application. The workflow status machine treats current equal next status as valid, so the service must decide whether repetition is a no-op or a fresh audit event. For operational workflows, a `status.changed` event should describe an actual state change. Auditing ACTIVE to ACTIVE as a change distorts timelines and can trigger downstream reporting confusion.

The corrected order is permission and ownership, transition validation, equality return, activation preconditions for a real move, repository write, then audit. Equality is checked after authorization and state lookup, so an unauthorized actor does not receive a free read path through the no-op branch. It returns the loaded record without a repository mutation.

| request | policy | side effects |
|---|---|---|
| ACTIVE -> ACTIVE | idempotent | none |
| ACTIVE -> PAUSED | allowed | update and audit |
| ACTIVE -> DRAFT | invalid | error only |
| DRAFT -> ACTIVE | readiness required | update after validation |

This is an application-level idempotency rule, not a database lock. Two concurrent callers can still race on different transitions because the repository update does not carry an old-status predicate. The runtime evidence proves call ordering with doubles; a live database test is needed for isolation claims.
