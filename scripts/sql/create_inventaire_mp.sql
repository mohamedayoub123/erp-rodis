-- Inventaire MP : comptage physique par lot (numero_lot), pas par article
-- agrege - un article peut avoir plusieurs lots en stock (voir
-- stock_mp_lot_balances(), deja en place), et un vrai inventaire physique se
-- fait lot par lot. Distribue le travail par petits lots de N (choisis par
-- l'utilisateur au demarrage), en priorisant les articles qui bougent le
-- plus (mp_movement_counts() ci-dessous). Comptage a l'aveugle (le stock
-- systeme n'est jamais affiche pendant la saisie) : jusqu'a 3 comptages
-- avant d'accepter un ecart, qui peut ensuite etre regularise
-- explicitement (voir regulariserLigneAction, app/stock/matiere-premiere/
-- inventaire/actions.ts) par une ligne ajoutee dans
-- lots_stock_matiere_premiere - jamais une correction automatique.

create table if not exists inventaire_mp_sessions (
  id bigint generated always as identity primary key,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'termine')),
  taille_lot integer not null,
  cree_par text,
  created_at timestamptz not null default now(),
  termine_at timestamptz
);

create table if not exists inventaire_mp_lignes (
  id bigint generated always as identity primary key,
  session_id bigint not null references inventaire_mp_sessions(id) on delete cascade,
  article_id bigint not null references articles_matiere_premiere(id),
  numero_lot text not null,
  -- Numero du "lot de travail" (le groupe de N articles distribue ensemble)
  -- au sein de la session - pas a confondre avec numero_lot (le lot
  -- physique/code compte).
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

create index if not exists idx_inventaire_mp_lignes_session on inventaire_mp_lignes(session_id);
create unique index if not exists idx_inventaire_mp_lignes_unique
  on inventaire_mp_lignes(session_id, article_id, numero_lot);

-- Nombre de mouvements (entrees + sorties confondues) par article - sert a
-- prioriser les articles les plus actifs en premier lors de la distribution
-- des lots de travail (voir fetchProchainLotDeTravail).
create or replace function public.mp_movement_counts()
returns table (article_id bigint, mouvement_count bigint)
language sql
stable
as $$
  select article_id, count(*) as mouvement_count
  from public.lots_stock_matiere_premiere
  where article_id is not null
  group by article_id;
$$;

revoke all on function public.mp_movement_counts() from public;
grant execute on function public.mp_movement_counts() to service_role;
