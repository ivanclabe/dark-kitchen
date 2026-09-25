# Migrations

Dark Kitchen runs on its **own Supabase project** `dark-kitchen` (ref `cqfzcwpqisaohcjaevxf`, region sa-east-1) since 2026-09-24 (ADR 0007). Until then it lived in the shared project `GreatBoost` (`iosxchnwfvimfgozumqh`) next to other apps, which is why every table, type and function is prefixed `dk_`; the prefix stays.

Workflow: add a `<timestamp>_name.sql` file here and apply it with the CLI (the repo is linked to the project):

```bash
supabase db push
```

The database password is in `.supabase-db-password.local` (git-ignored); pass it as `SUPABASE_DB_PASSWORD`.

**Source of truth (2026-09-24):** the `.sql` files in this folder are an exact export of `supabase_migrations.schema_migrations` for every `dk_*` migration (same version, name and SQL as applied). Earlier hand-written mirrors had drifted (different versions, two missing) and were replaced. This set replays cleanly on an empty Supabase project (`supabase db push`), which is how Dark Kitchen moves to its own project (ADR 0007).

## Pruebas SQL

Las suites de `supabase/tests/` corren contra el proyecto enlazado, cada una en una transacción que se revierte:

```bash
python3 supabase/tests/run.py                                          # todas
python3 supabase/tests/run.py organizations                            # solo las que contengan "organizations"
python3 supabase/tests/run.py --with supabase/migrations/<nueva>.sql   # ensayar una migración antes de aplicarla
```
