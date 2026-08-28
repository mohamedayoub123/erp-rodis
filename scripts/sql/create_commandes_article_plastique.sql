-- Commande Article Plastique - "Save" depuis Statistique Article Plastique
-- (E3) : chaque clic cree une NOUVELLE commande (photo figee des articles
-- qui ont un avis de fabrication rempli a cet instant, avec leur stock
-- actuel de l'instant), jamais une mise a jour d'une commande existante -
-- demande explicite. Code du type "C2026.1" (annee + numero sequentiel
-- dans l'annee, reparti a 1 chaque nouvelle annee).
create table if not exists public.commandes_article_plastique (
  id bigint generated always as identity primary key,
  code text not null unique,
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists public.commandes_article_plastique_lignes (
  id bigint generated always as identity primary key,
  commande_id bigint not null references public.commandes_article_plastique(id) on delete cascade,
  article_id bigint not null references public.articles_matiere_premiere(id),
  nom_article text not null,
  categorie text,
  gamme text,
  qt_avis text,
  stock_actuel numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_commandes_article_plastique_lignes_commande
  on public.commandes_article_plastique_lignes (commande_id);
