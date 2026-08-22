-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute prix_unitaire/devise/taux_change au resultat de stock_mp_display_rows
-- (page Stock MP) - demande explicite : voir directement quels lots ont un
-- prix connu, et pouvoir le corriger/effacer depuis cette page (le prix
-- vient toujours de la ligne d'ENTREE, jamais d'une sortie, meme
-- convention que partout ailleurs).
drop function if exists stock_mp_display_rows(text, text, date, date, int, int, int, boolean, bigint, int, int);

create or replace function stock_mp_display_rows(
  p_article_q text default null,
  p_code_q text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_month_from int default null,
  p_month_to int default null,
  p_year int default null,
  p_hide_zero boolean default false,
  p_depot_id bigint default null,
  p_limit int default 200,
  p_offset int default 0
)
returns table (
  display_key text,
  id bigint,
  article_id bigint,
  nom_article text,
  gamme text,
  categorie text,
  mouvement_type text,
  numero_lot text,
  code_normalise text,
  unite text,
  date_fabrication date,
  date_expiration date,
  date_jour date,
  qte_entree numeric,
  qte_sortie numeric,
  stock_code numeric,
  stock_article numeric,
  fournisseur text,
  client text,
  n_doss_erp text,
  n_doss_4d text,
  mouvement_groupe_id bigint,
  note text,
  utilisateur text,
  created_at timestamptz,
  total_rows bigint,
  total_entree_visible numeric,
  total_sortie_visible numeric,
  prix_unitaire numeric,
  devise text,
  taux_change numeric
)
language sql
stable
as $$
  with split_rows as (
    select l.id, l.article_id, l.depot_id, l.numero_lot, l.code_normalise, l.date_fabrication,
           l.date_expiration, l.date_jour, v.qte_entree, v.qte_sortie, v.mouvement_type,
           (l.id::text || '-' || v.mouvement_type) as display_key,
           l.unite, l.fournisseur, l.client, l.n_doss_erp, l.n_doss_4d, l.utilisateur, l.note,
           l.mouvement_groupe_id, l.created_at,
           -- Le prix ne s'applique qu'a la ligne AFFICHEE en entree (jamais
           -- une sortie du meme lot, meme convention que partout ailleurs -
           -- voir app/depots/transfer-order/stock-lots.ts).
           case when v.mouvement_type = 'entree' then l.prix_unitaire else null end as prix_unitaire,
           case when v.mouvement_type = 'entree' then l.devise else null end as devise,
           case when v.mouvement_type = 'entree' then l.taux_change else null end as taux_change
    from lots_stock_matiere_premiere l
    cross join lateral (
      select l.qte_entree as qte_entree, 0::numeric as qte_sortie, 'entree' as mouvement_type
      where coalesce(l.qte_entree, 0) > 0
      union all
      select 0::numeric, l.qte_sortie, 'sortie'
      where coalesce(l.qte_sortie, 0) > 0
      union all
      select l.qte_entree, l.qte_sortie, 'sortie'
      where coalesce(l.qte_entree, 0) <= 0 and coalesce(l.qte_sortie, 0) <= 0
    ) v
  ),
  depot_scoped as (
    select s.*, a.nom_article, a.gamme, a.categorie
    from split_rows s
    left join articles_matiere_premiere a on a.id = s.article_id
    where p_depot_id is null or coalesce(s.depot_id, a.depot_id) = p_depot_id
  ),
  with_stock as (
    select d.*,
      sum(d.qte_entree - d.qte_sortie) over (
        partition by d.article_id, coalesce(nullif(d.numero_lot, ''), d.code_normalise)
      ) as stock_code,
      sum(d.qte_entree - d.qte_sortie) over (
        partition by d.article_id
        order by d.date_jour asc nulls first, (case when d.qte_entree > 0 then 0 else 1 end), d.id asc
        rows unbounded preceding
      ) as stock_article
    from depot_scoped d
  ),
  filtered as (
    select w.*
    from with_stock w
    where matches_article_search(w.nom_article, p_article_q)
      and (p_code_q is null or btrim(p_code_q) = '' or w.numero_lot ilike '%' || p_code_q || '%')
      and (not p_hide_zero or w.stock_code > 0)
      and (
        w.date_jour is not null
        or (p_date_from is null and p_date_to is null and p_month_from is null and p_month_to is null and p_year is null)
      )
      and (p_date_from is null or w.date_jour >= p_date_from)
      and (p_date_to is null or w.date_jour <= p_date_to)
      and (p_year is null or extract(year from w.date_jour) = p_year)
      and (p_month_from is null or extract(month from w.date_jour) >= p_month_from)
      and (p_month_to is null or extract(month from w.date_jour) <= p_month_to)
  ),
  counted as (
    select f.*, count(*) over () as total_rows
    from filtered f
  ),
  paged as (
    select c.*
    from counted c
    order by c.date_jour desc nulls last, c.id desc
    limit p_limit offset p_offset
  )
  select
    p.display_key, p.id, p.article_id, p.nom_article, p.gamme, p.categorie, p.mouvement_type,
    p.numero_lot, p.code_normalise, p.unite, p.date_fabrication, p.date_expiration, p.date_jour,
    p.qte_entree, p.qte_sortie, p.stock_code, p.stock_article, p.fournisseur, p.client,
    p.n_doss_erp, p.n_doss_4d, p.mouvement_groupe_id, p.note, p.utilisateur, p.created_at,
    p.total_rows,
    (select coalesce(sum(qte_entree), 0) from paged) as total_entree_visible,
    (select coalesce(sum(qte_sortie), 0) from paged) as total_sortie_visible,
    p.prix_unitaire, p.devise, p.taux_change
  from paged p;
$$;
