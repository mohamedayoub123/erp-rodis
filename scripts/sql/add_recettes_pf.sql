-- Distingue les articles PF "vrac" (sortie de Fabrication) des articles PF
-- normaux/finis (sortie de Conditionnement). "type_article" existe deja et
-- sert a autre chose (parfume/hydratant/gel douche...), d'ou un nouveau nom.
alter table articles
  add column if not exists nature text not null default 'fini';

-- Formule (BOM) : pour un article PF (vrac ou fini), la liste des articles
-- MP qui le composent avec leur quantite. Une seule table pour les deux
-- recettes (fabrication et conditionnement) - la nature de l'article PF
-- (vrac/fini) determine sur quelle page la recette apparait.
create table if not exists recettes_pf (
  id bigint generated always as identity primary key,
  article_pf_id bigint not null references articles(id) on delete cascade,
  article_mp_id bigint not null references articles_matiere_premiere(id) on delete cascade,
  quantite numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (article_pf_id, article_mp_id)
);

create index if not exists recettes_pf_article_pf_id_idx on recettes_pf(article_pf_id);
