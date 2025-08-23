# Merge/Adoption Strategy (Authoritative Draft)

Premise: The to-be architecture is primary; the current repository code may be fully replaced. Any reuse is opportunistic.

Options
1) Greenfield in-place:
   - Add new code under src/maps/ (or src/modules/maps/), SQLite repository, and new /maps router.
   - Keep /api/state only for compatibility during transition, then remove.
2) Greenfield branch/repo:
   - Create a new branch (or repo) implementing only the to-be design.
   - Migrate client to new API, archive old code.

Safeguards
- Small, reversible commits; tags before major changes.
- No destructive cleanups until the new path is validated by tests and client.
