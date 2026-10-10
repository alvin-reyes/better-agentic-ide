---
paradigm: "{paradigm}"
scope: TODO
owner: Sam
---

# arch-demo

## Context

The system is TBD after the migration.

## Stack

| Name | Version | Notes |
| --- | --- | --- |
| postgres | | primary store |
| redis | 7.2 | cache |
| {datastore} | 1.0 | placeholder name |

## Decisions

### AD-1 First decision

Binds: the ingest path.
Prevents: unbounded retries.

### AD-2 Second decision

Binds: the read path.

### AD-3 Similar to AD-1

Binds: the report path.
Prevents: double counting.

### AD-2 Reused id

Binds: nothing.
Prevents: nothing.
Rule: none.

### AD-1 Back to one

Binds: the deploy path.
Prevents: drift.
