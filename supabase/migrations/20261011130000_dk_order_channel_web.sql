-- ADR 0052 (D4): «Menú web», the channel of orders placed on the public menu.
-- Alone in its migration: a new enum value cannot be used in the transaction that adds it.
alter type dk_order_channel add value if not exists 'WEB';
