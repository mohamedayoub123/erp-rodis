-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute une Remarque libre sur Transfer Order et Transfer Invoice -
-- demande explicite.
--
-- Idempotent (peut etre relance sans risque) - colonnes nullable, aucune
-- donnee existante modifiee.
alter table public.transfer_orders
  add column if not exists remarque text;

alter table public.invoice_orders
  add column if not exists remarque text;
