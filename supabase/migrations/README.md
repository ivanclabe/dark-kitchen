# Migrations

This project's Supabase database is shared with other apps in this workspace (see [`docs/adr/0006` context] and the Phase 0 architecture docs) — every Dark Kitchen table, type, and function is prefixed `dk_` to stay isolated from the rest of the project's schema.

Migrations are applied directly to the remote project via the Supabase MCP tools (`apply_migration`) and mirrored here as `.sql` files (named with the version returned by the tool) purely for version-controlled history — this repo does not run its own local Supabase stack yet.
