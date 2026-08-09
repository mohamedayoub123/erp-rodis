-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Le champ Depot sur l'article (articles.depot_id / articles_matiere_premiere.
-- depot_id) n'est qu'un DEFAUT (ex: MP = Depot E par defaut) - le stock reel
-- doit pouvoir se trouver dans n'importe quel depot une fois transfere. Le
-- depot devient donc un champ par LOT (ligne de stock), pas par article.
alter table public.lots_stock_matiere_premiere
  add column if not exists depot_id bigint references public.depots(id);

alter table public.lots_stock
  add column if not exists depot_id bigint references public.depots(id);

-- Stock existant : demarre dans le depot par defaut de son article (E pour
-- toute la MP, A/B pour le PF selon vrac ou non) - modifiable ensuite via un
-- Transfer Order.
update public.lots_stock_matiere_premiere l
set depot_id = a.depot_id
from public.articles_matiere_premiere a
where l.article_id = a.id and l.depot_id is null;

update public.lots_stock l
set depot_id = a.depot_id
from public.articles a
where l.article_id = a.id and l.depot_id is null;

-- Transfer Order (TO1.2026, TO2.2026...) : demande de transfert d'un depot
-- vers un autre, d'abord "en_attente", puis "approuve" (les lots a
-- transferer sont choisis - au plus proche de la date d'expiration
-- d'abord, modifiable), puis "poste" vers un Invoice Order.
create table if not exists public.transfer_orders (
  id bigserial primary key,
  depot_source_id bigint not null references public.depots(id),
  depot_destination_id bigint not null references public.depots(id),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'approuve', 'poste')),
  date_jour date not null default current_date,
  cree_par text,
  created_at timestamptz not null default now()
);

create table if not exists public.transfer_order_lignes (
  id bigserial primary key,
  transfer_order_id bigint not null references public.transfer_orders(id) on delete cascade,
  article_type text not null check (article_type in ('MP', 'PF')),
  article_id bigint not null,
  quantite_demandee numeric not null,
  created_at timestamptz not null default now()
);

-- Repartition par lot d'une ligne, remplie automatiquement a l'approbation
-- (FEFO - lot avec la date d'expiration la plus proche en premier),
-- modifiable ensuite a la main.
create table if not exists public.transfer_order_ligne_lots (
  id bigserial primary key,
  transfer_order_ligne_id bigint not null references public.transfer_order_lignes(id) on delete cascade,
  numero_lot text,
  quantite numeric not null,
  created_at timestamptz not null default now()
);

-- Invoice Order (IO1.2026, IO2.2026...) : cree depuis un Transfer Order
-- approuve ("Poster a Invoice Order") - reutilise ses lignes/lots tels
-- quels. Le mouvement de stock reel (sortie du depot source, entree dans le
-- depot destination) n'a lieu qu'a la validation de l'Invoice Order.
create table if not exists public.invoice_orders (
  id bigserial primary key,
  transfer_order_id bigint not null references public.transfer_orders(id),
  statut text not null default 'draft' check (statut in ('draft', 'valide')),
  date_jour date not null default current_date,
  cree_par text,
  created_at timestamptz not null default now()
);

create index if not exists transfer_order_lignes_transfer_order_id_idx on public.transfer_order_lignes (transfer_order_id);
create index if not exists transfer_order_ligne_lots_ligne_id_idx on public.transfer_order_ligne_lots (transfer_order_ligne_id);
create index if not exists invoice_orders_transfer_order_id_idx on public.invoice_orders (transfer_order_id);
