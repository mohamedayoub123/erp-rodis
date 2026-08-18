-- Accelere Stock Actuel PF (app/stock/stock-actuel) et Stock Actuel MP
-- (app/stock/matiere-premiere/stock-actuel) : ces 2 pages recalculaient le
-- stock de chaque article en rapatriant TOUTES les lignes de lots_stock /
-- lots_stock_matiere_premiere (des journaux de mouvement qui ne font que
-- grossir) puis en sommant en JS - la somme se fait maintenant directement
-- en base, une seule ligne par article renvoyee.

create or replace function stock_actuel_pf_rows()
returns table (
  article_id bigint,
  nom_article text,
  type_article text,
  stock_actuel numeric,
  codes text[]
)
language sql
stable
as $$
  select
    a.id as article_id,
    a.nom_article,
    a.type_article,
    coalesce(sum(l.qte_entree - l.qte_sortie), 0) as stock_actuel,
    coalesce(
      array_agg(distinct l.numero_lot) filter (where l.numero_lot is not null and btrim(l.numero_lot) <> ''),
      '{}'
    ) as codes
  from articles a
  left join lots_stock l on l.article_id = a.id
  group by a.id, a.nom_article, a.type_article;
$$;

create or replace function stock_actuel_mp_rows()
returns table (
  article_id bigint,
  nom_article text,
  categorie text,
  unite text,
  stock_actuel numeric,
  codes text[]
)
language sql
stable
as $$
  select
    a.id as article_id,
    a.nom_article,
    a.categorie,
    a.unite,
    coalesce(sum(l.qte_entree - l.qte_sortie), 0) as stock_actuel,
    coalesce(
      array_agg(distinct l.numero_lot) filter (where l.numero_lot is not null and btrim(l.numero_lot) <> ''),
      '{}'
    ) as codes
  from articles_matiere_premiere a
  left join lots_stock_matiere_premiere l on l.article_id = a.id
  group by a.id, a.nom_article, a.categorie, a.unite;
$$;
