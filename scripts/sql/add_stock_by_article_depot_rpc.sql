-- La page Produit chargeait TOUTES les lignes de lots_stock (PF, 16 000+) ET
-- lots_stock_matiere_premiere (MP, 41 000+) juste pour les additionner par
-- (article, depot) en JS. Simple somme groupee - la base le fait directement,
-- sans jamais renvoyer les lignes brutes a l'application.

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
  group by l.article_id, coalesce(l.depot_id, a.depot_id);
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
  group by l.article_id, coalesce(l.depot_id, a.depot_id);
$$;
