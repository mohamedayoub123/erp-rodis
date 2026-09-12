-- Bug : stock_by_article_depot_mp/pf et stock_actuel_mp_rows/pf_rows n'avaient
-- pas de ORDER BY. Le code app (capacite-lib.ts, produit/page.tsx,
-- stock-actuel/page.tsx, rapport/mouvements/page.tsx) lit ces fonctions par
-- pages de 1000 lignes via .range() - sans tri deterministe, Postgres peut
-- repartir les lignes du GROUP BY differemment d'un appel a l'autre entre les
-- pages, ce qui fait sauter certaines lignes (et en duplique d'autres
-- ailleurs). Confirme en base : COLORANT MM BLANC LAIT/SCCI83007/SE
-- 100285/SWN015 (article_id 8336) disparaissait totalement de
-- stock_by_article_depot_mp() malgre 58 lots reels, pendant que 546 autres
-- couples (article, depot) apparaissaient en double - d'ou "Stock MP" montre
-- du stock mais "Stock actuel" montre rien pour cet article.

create or replace function stock_by_article_depot_pf()
returns table (article_id bigint, depot_id bigint, stock numeric)
language sql
stable
as $$
  select l.article_id, coalesce(l.depot_id, a.depot_id) as depot_id,
         sum(coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0)) as stock
  from lots_stock l
  join articles a on a.id = l.article_id
  where l.article_id is not null and coalesce(l.depot_id, a.depot_id) is not null
  group by l.article_id, coalesce(l.depot_id, a.depot_id)
  order by l.article_id, coalesce(l.depot_id, a.depot_id);
$$;

create or replace function stock_by_article_depot_mp()
returns table (article_id bigint, depot_id bigint, stock numeric)
language sql
stable
as $$
  select l.article_id, coalesce(l.depot_id, a.depot_id) as depot_id,
         sum(coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0)) as stock
  from lots_stock_matiere_premiere l
  join articles_matiere_premiere a on a.id = l.article_id
  where l.article_id is not null and coalesce(l.depot_id, a.depot_id) is not null
  group by l.article_id, coalesce(l.depot_id, a.depot_id)
  order by l.article_id, coalesce(l.depot_id, a.depot_id);
$$;

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
  group by a.id, a.nom_article, a.type_article
  order by a.id;
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
  group by a.id, a.nom_article, a.categorie, a.unite
  order by a.id;
$$;
