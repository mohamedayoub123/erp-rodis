-- 1) Inventaire MP : autorise le statut "annule" (bouton "Annuler
-- l'inventaire", demande explicite - abandonner une session sans la
-- compter comme terminee).
alter table public.inventaire_mp_sessions drop constraint if exists inventaire_mp_sessions_statut_check;
alter table public.inventaire_mp_sessions add constraint inventaire_mp_sessions_statut_check
  check (statut in ('en_cours', 'termine', 'annule'));

-- 2) Inventaire PF : meme principe que l'inventaire MP (voir
-- create_inventaire_mp.sql), mais contre articles/lots_stock (catalogue et
-- grand livre produit fini) au lieu de articles_matiere_premiere/
-- lots_stock_matiere_premiere. lots_stock n'a pas de colonne unite/depot_id
-- fiable (voir regulariserLignePfAction, qui ne les utilise pas).

create table if not exists inventaire_pf_sessions (
  id bigint generated always as identity primary key,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'termine', 'annule')),
  taille_lot integer not null,
  cree_par text,
  created_at timestamptz not null default now(),
  termine_at timestamptz
);

create table if not exists inventaire_pf_lignes (
  id bigint generated always as identity primary key,
  session_id bigint not null references inventaire_pf_sessions(id) on delete cascade,
  article_id bigint not null references articles(id),
  numero_lot text not null,
  lot_numero integer not null,
  stock_systeme numeric not null,
  compte_1 numeric,
  compte_2 numeric,
  compte_3 numeric,
  nombre_comptages integer not null default 0,
  statut text not null default 'a_compter'
    check (statut in ('a_compter', 'bon', 'ecart_confirme', 'regularise')),
  compte_par text,
  regularise_par text,
  regularise_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventaire_pf_lignes_session on inventaire_pf_lignes(session_id);
create unique index if not exists idx_inventaire_pf_lignes_unique
  on inventaire_pf_lignes(session_id, article_id, numero_lot);

-- Solde par lot (article + code), meme principe que stock_mp_lot_balances()
-- mais avec le repli code_normalise/numero_lot deja utilise par
-- stock_record_sortie_batch pour lots_stock (numero_lot seul n'est pas
-- toujours renseigne de facon homogene cote PF).
create or replace function public.stock_pf_lot_balances()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select
    article_id,
    max(coalesce(nullif(code_normalise, ''), numero_lot)) as numero_lot,
    sum(qte_entree) - sum(qte_sortie) as stock
  from public.lots_stock
  where article_id is not null
    and coalesce(nullif(code_normalise, ''), numero_lot) is not null
    and coalesce(nullif(code_normalise, ''), numero_lot) <> ''
  group by article_id, upper(trim(coalesce(nullif(code_normalise, ''), numero_lot)))
  having sum(qte_entree) - sum(qte_sortie) > 0;
$$;

revoke all on function public.stock_pf_lot_balances() from public;
grant execute on function public.stock_pf_lot_balances() to service_role;

-- Nombre de mouvements par article, pour prioriser les articles les plus
-- actifs en premier - meme principe que mp_movement_counts().
create or replace function public.pf_movement_counts()
returns table (article_id bigint, mouvement_count bigint)
language sql
stable
as $$
  select article_id, count(*) as mouvement_count
  from public.lots_stock
  where article_id is not null
  group by article_id;
$$;

revoke all on function public.pf_movement_counts() from public;
grant execute on function public.pf_movement_counts() to service_role;
