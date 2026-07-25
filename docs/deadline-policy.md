# MVP deadline policy

## Decision

For the 2026-live MVP, the canonical federal catalog uses the approved `canonical-2026-pre-election-lock-v1` UTC `closeAt` of `2026-11-03T00:00:00.000Z`. A prediction is open only while the server time is strictly earlier than that timestamp.

This is a PolitiPiks product policy for a simple, consistent MVP experience. It is not an assertion of an official jurisdiction poll-closing time, and it must not be represented as one in product copy or data provenance.

## Approval gate

This is a product safety lock, not an assertion of official state poll-close time. Reviewed official poll-close evidence is supplemental and may shorten a future cutoff only through a separately reviewed policy release; it can never automatically extend this lock.

Until that approval exists, records without `closeAt` remain closed for picking: the client disables them and Firestore rules reject their prediction writes.

## Operational method

The guarded `npm run migrate-close-at` command defaults to a no-connection dry run. A write requires all of the following at once:

- `--apply`
- `--project-id politipiks`
- `--database-id ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`
- `--expected-count <approved missing-closeAt count>`
- `--deadline <approved ISO UTC timestamp with milliseconds>`

The command rejects any other project or database, malformed/non-UTC timestamp, count mismatch, non-Timestamp or conflicting existing `closeAt`, and concurrency changes detected by a Firestore update precondition. It writes no more than 400 documents per batch and emits JSON describing the planned or completed batches.
