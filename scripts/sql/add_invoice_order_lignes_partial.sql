-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Livraison partielle sur le Transfer Invoice : chaque TI a maintenant ses
-- propres lignes (copiees depuis le Transfer Order au moment du "Poster a
-- Transfer Invoice"), modifiables a la baisse (ou effacees en mettant la
-- quantite a 0) avant l'Approuver. Ce qui n'est pas livre repart
-- automatiquement sur le Transfer Order, qui passe alors au statut
-- "partiellement_fini" et peut etre poste a nouveau vers un nouveau Transfer
-- Invoice pour le reste.
alter table public.transfer_orders drop constraint if exists transfer_orders_statut_check;
alter table public.transfer_orders
  add constraint transfer_orders_statut_check
  check (statut in ('en_attente', 'approuve', 'partiellement_fini', 'poste'));

create table if not exists public.invoice_order_lignes (
  id bigserial primary key,
  invoice_order_id bigint not null references public.invoice_orders(id) on delete cascade,
  transfer_order_ligne_id bigint not null references public.transfer_order_lignes(id),
  numero_lot text,
  quantite numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_order_lignes_invoice_order_id_idx on public.invoice_order_lignes (invoice_order_id);
create index if not exists invoice_order_lignes_transfer_order_ligne_id_idx on public.invoice_order_lignes (transfer_order_ligne_id);
