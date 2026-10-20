-- ADR 0072: the account's console keeps three more preferences on the device (folded sidebar, the panels of
-- Destacado and its dismissed notices). The Cookie Policy lists them: version 1.1 (informational, no new
-- acceptance). Generated with `npm run legal -- --sql`.
insert into dk_legal_documents (slug, version, title, effective_date, content_sha256, acceptance, requires_reacceptance) values
  ('cookies', '1.1', 'Política de Cookies', '2026-10-20', '17f46eea89568e1ecd8e04edac5d2476dde5cb710dfeb6108d28b8a1268b21af', 'informational', false)
on conflict (slug, version) do nothing;
