-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Nouveau systeme "Depots" independant des pages Stock MP/PF existantes -
-- l'utilisateur cree librement les depots qu'il veut (ex: "Depot A" pour le
-- produit fini, "Depot E" pour la matiere premiere, "Depot B" qui melange
-- les 2 pour la production) et transfere du stock entre eux.
create table if not exists public.depots (
  id bigint generated always as identity primary key,
  nom text not null,
  created_at timestamptz not null default now()
);

-- Le stock par depot est un solde derive (entree - sortie), jamais stocke
-- directement - meme principe que lots_stock_matiere_premiere/lots_stock
-- ailleurs dans l'appli. article_type distingue MP (articles_matiere_premiere)
-- de PF (articles) - 2 tables d'articles separees dans ce schema, donc pas
-- de FK directe possible sur article_id (son sens depend de article_type).
-- Un transfert = 2 lignes (une "sortie" sur le depot source, une "entree"
-- sur le depot destination) liees par le meme transfert_id.
create table if not exists public.depot_mouvements (
  id bigint generated always as identity primary key,
  depot_id bigint not null references public.depots(id),
  article_type text not null check (article_type in ('MP', 'PF')),
  article_id bigint not null,
  type text not null check (type in ('entree', 'sortie')),
  quantite numeric not null,
  transfert_id bigint,
  depot_lie_id bigint references public.depots(id),
  date_jour date not null default current_date,
  utilisateur text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists depot_mouvements_depot_id_idx on public.depot_mouvements (depot_id);
create index if not exists depot_mouvements_article_idx on public.depot_mouvements (article_type, article_id);
