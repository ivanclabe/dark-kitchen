-- Advisor function_search_path_mutable: search_path fijo (no lee tablas; solo endurece).
alter function dk_is_syncing_master() set search_path = public;
