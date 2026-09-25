# Local project persistence (mila-planogram)

## What is already true

`openPlan3D` never synced projects to a remote service. The only persistence path is local
and it lives behind a single interface:

| Layer | File | Role |
| --- | --- | --- |
| `DataStore` interface + `localStore` | `src/lib/services/datastore.ts` | `has` / `load` / `save` / `saveCopy` / `list` / `delete` / `duplicate` / thumbnails / `assertCurrent` |
| IndexedDB implementation | `src/lib/services/localDatabase.ts` | `openplan3d-local` DB, stores `projects` / `thumbnails` / `history` / `meta`, transactional writes, legacy `localStorage` migration |
| Save orchestration | `src/lib/stores/saveStatus.ts` | `autoSave`, `manualSave`, conflict handling |
| Library restore / backup | `src/lib/services/libraryRestore.ts`, `datastore.ts` | raw-byte backups, damaged-library recovery |

So the Phase 1.1 requirement ("localStorage-провайдер save/load with the same interface as the
remote service") is satisfied by the existing `DataStore` contract. The implementation uses
IndexedDB instead of `localStorage`: project JSON can exceed the ~5 MB `localStorage` quota, and
IndexedDB gives atomic compare-and-write transactions (`ProjectConflictError` on cross-tab races).
`localStorage` is used **only** for a tiny non-data change notification (`LIBRARY_CHANGE_KEY`) and
for the legacy-library read path. No project bytes are written to `localStorage`.

## Decision

There is no remote datastore to keep. Therefore Phase 1.1 introduces no new provider: the
`DataStore` interface stays the save/load contract, and `createLocalStore()` is the only
implementation. Step 1.2 then removes the remaining Firebase footprint (analytics bootstrap,
App Hosting / Storage config files, `firebase` dependency) — none of which touched project data.

## Guarantees enforced by tests

`tests/local-persistence.test.ts`:

- save → load round-trip through `localStore` with `fetch` stubbed to throw: persistence never
  performs a network call;
- project bytes land in the IndexedDB `projects` store while no `localStorage` value contains
  project data (only the change-notification nonce);
- `storageErrorMessage()` gives a JSON-backup recovery hint, not a "sync failed" message.

Existing coverage kept as-is: `tests/datastore.test.ts` (round-trip, quota failure, conflict),
`tests/localDatabase.test.ts` (transactions, legacy migration), `tests/saveStatus.test.ts`.
