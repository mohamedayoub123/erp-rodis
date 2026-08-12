-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET V1/PRODUCTION.
--
-- Porte vers V1 tout le schema deja en place sur V2 pour : le Dispatch +
-- verification stock sur "Programme" (MB), et le module Entrepot complet
-- (Depots, Transfer Order, Transfer Invoice, Produit). Consolide plusieurs
-- scripts distincts appliques sur V2 au fil du developpement - idempotent
-- (peut etre relance sans risque), sans effet sur les donnees/fonctions
-- deja existantes sur V1 (assignDispatcherCodesAndInsert de "Programme par
-- ligne" reste totalement intact, aucune table qu'il utilise deja n'est
-- modifiee ici).

-- 1) Programme (MB) : lignes miroir dans programme_lignes + plateforme.
alter table public.programme_lignes
  add column if not exists source_numero_programme bigint;
alter table public.programme_lignes
  add column if not exists source_programme_id bigint references public.programmes(id);
create index if not exists programme_lignes_source_numero_programme_idx
  on public.programme_lignes (source_numero_programme);

alter table public.programmes
  add column if not exists plateforme text not null default 'M';

-- 2) Depots (bases de tout l'Entrepot).
create table if not exists public.depots (
  id bigint generated always as identity primary key,
  nom text not null,
  created_at timestamptz not null default now()
);

insert into public.depots (nom)
select 'Depot A' where not exists (select 1 from public.depots where nom = 'Depot A');
insert into public.depots (nom)
select 'Depot B' where not exists (select 1 from public.depots where nom = 'Depot B');
insert into public.depots (nom)
select 'Depot E' where not exists (select 1 from public.depots where nom = 'Depot E');

-- 3) Depot sur chaque article (defaut) + sur chaque lot de stock (reel).
alter table public.articles
  add column if not exists depot_id bigint references public.depots(id);
alter table public.articles_matiere_premiere
  add column if not exists depot_id bigint references public.depots(id);

update public.articles
set depot_id = (select id from public.depots where nom = 'Depot B')
where nature = 'vrac' and depot_id is null;
update public.articles
set depot_id = (select id from public.depots where nom = 'Depot A')
where (nature is distinct from 'vrac') and depot_id is null;
update public.articles_matiere_premiere
set depot_id = (select id from public.depots where nom = 'Depot E')
where depot_id is null;

alter table public.lots_stock_matiere_premiere
  add column if not exists depot_id bigint references public.depots(id);
alter table public.lots_stock
  add column if not exists depot_id bigint references public.depots(id);

update public.lots_stock_matiere_premiere l
set depot_id = a.depot_id
from public.articles_matiere_premiere a
where l.article_id = a.id and l.depot_id is null;
update public.lots_stock l
set depot_id = a.depot_id
from public.articles a
where l.article_id = a.id and l.depot_id is null;

-- 4) Transfer Order / Transfer Invoice (Invoice Order).
create table if not exists public.transfer_orders (
  id bigserial primary key,
  depot_source_id bigint not null references public.depots(id),
  depot_destination_id bigint not null references public.depots(id),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'approuve', 'partiellement_fini', 'poste')),
  date_jour date not null default current_date,
  cree_par text,
  created_at timestamptz not null default now(),
  famille_produit text,
  type_mp text,
  numero integer,
  source_numero_programme integer
);

create table if not exists public.transfer_order_lignes (
  id bigserial primary key,
  transfer_order_id bigint not null references public.transfer_orders(id) on delete cascade,
  article_type text not null check (article_type in ('MP', 'PF')),
  article_id bigint not null,
  quantite_demandee numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.transfer_order_ligne_lots (
  id bigserial primary key,
  transfer_order_ligne_id bigint not null references public.transfer_order_lignes(id) on delete cascade,
  numero_lot text,
  quantite numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_orders (
  id bigserial primary key,
  transfer_order_id bigint not null references public.transfer_orders(id),
  statut text not null default 'draft' check (statut in ('draft', 'valide')),
  date_jour date not null default current_date,
  cree_par text,
  created_at timestamptz not null default now(),
  numero integer
);

create table if not exists public.invoice_order_lignes (
  id bigserial primary key,
  invoice_order_id bigint not null references public.invoice_orders(id) on delete cascade,
  transfer_order_ligne_id bigint not null references public.transfer_order_lignes(id),
  numero_lot text,
  quantite numeric not null,
  created_at timestamptz not null default now(),
  sortie_lot_id bigint,
  entree_lot_id bigint
);

create index if not exists transfer_order_lignes_transfer_order_id_idx on public.transfer_order_lignes (transfer_order_id);
create index if not exists transfer_order_ligne_lots_ligne_id_idx on public.transfer_order_ligne_lots (transfer_order_ligne_id);
create index if not exists invoice_orders_transfer_order_id_idx on public.invoice_orders (transfer_order_id);
create index if not exists invoice_order_lignes_invoice_order_id_idx on public.invoice_order_lignes (invoice_order_id);
create index if not exists invoice_order_lignes_transfer_order_ligne_id_idx on public.invoice_order_lignes (transfer_order_ligne_id);

-- 5) Reservation MP (Salle de pesage/conditionnement) - necessaire au flux
-- "Verifier stock" de Programme (MB), qui reserve la MP en Depot B.
create table if not exists public.production_mp_reserve (
  id bigserial primary key,
  production_code_termine_id bigint not null references public.production_code_termine(id) on delete cascade,
  article_mp_id bigint not null references public.articles_matiere_premiere(id),
  depot_id bigint not null references public.depots(id),
  quantite numeric not null,
  created_at timestamptz not null default now(),
  quantite_initiale numeric,
  numero_lot text
);

update public.production_mp_reserve set quantite_initiale = quantite where quantite_initiale is null;
alter table public.production_mp_reserve alter column quantite_initiale set not null;

create index if not exists production_mp_reserve_article_depot_idx
  on public.production_mp_reserve (article_mp_id, depot_id);
