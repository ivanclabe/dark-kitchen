-- ADR 0057: a batch of a preparation moves stock both ways — its components go out, the preparation comes in.
-- On its own migration: Postgres does not let a new enum value be used in the transaction that adds it.
alter type dk_movement_type add value if not exists 'PRODUCCION';
