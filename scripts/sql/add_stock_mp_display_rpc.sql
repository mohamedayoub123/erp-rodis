-- Stock MP (app/stock/matiere-premiere/stock) chargeait TOUTE la table
-- lots_stock_matiere_premiere (41 000+ lignes, ~5.5s de reseau) a chaque
-- ouverture de page pour calculer stock_code/stock_article puis filtrer/
-- paginer en JS - alors que 200 lignes seulement sont affichees. Cette RPC
-- fait tout le travail (eclatement entree/sortie, cumul, filtres,
-- pagination) directement en base, qui ne renvoie que la page demandee.

create or replace function matches_article_search(p_text text, p_query text)
returns boolean
language sql
immutable
as $$
  select case
    when p_query is null or btrim(p_query) = '' then true
    else not exists (
      select 1
      from unnest(regexp_split_to_array(lower(btrim(p_query)), '\s+')) as token
      where token <> '' and not exists (
        select 1
        from unnest(regexp_split_to_array(lower(coalesce(p_text, '')), '\s+')) as w
        where w like token || '%'
      )
    )
  end;
$$;

create or replace function stock_mp_display_rows(
  p_article_q text default null,
  p_code_q text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_month_from int default null,
  p_month_to int default null,
  p_year int default null,
  p_hide_zero boolean default false,
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
  total_sortie_visible numeric
)
language sql
stable
as $$
  with split_rows as (
    select l.id, l.article_id, l.numero_lot, l.code_normalise, l.date_fabrication,
           l.date_expiration, l.date_jour, l.qte_entree as qte_entree, 0::numeric as qte_sortie,
           l.unite, l.fournisseur, l.client, l.n_doss_erp, l.n_doss_4d, l.utilisateur, l.note,
           l.mouvement_groupe_id, l.created_at, 'entree' as mouvement_type,
           (l.id::text || '-entree') as display_key
    from lots_stock_matiere_premiere l
    where coalesce(l.qte_entree, 0) > 0
    union all
    select l.id, l.article_id, l.numero_lot, l.code_normalise, l.date_fabrication,
           l.date_expiration, l.date_jour, 0::numeric as qte_entree, l.qte_sortie,
           l.unite, l.fournisseur, l.client, l.n_doss_erp, l.n_doss_4d, l.utilisateur, l.note,
           l.mouvement_groupe_id, l.created_at, 'sortie' as mouvement_type,
           (l.id::text || '-sortie') as display_key
    from lots_stock_matiere_premiere l
    where coalesce(l.qte_sortie, 0) > 0
    union all
    select l.id, l.article_id, l.numero_lot, l.code_normalise, l.date_fabrication,
           l.date_expiration, l.date_jour, l.qte_entree, l.qte_sortie,
           l.unite, l.fournisseur, l.client, l.n_doss_erp, l.n_doss_4d, l.utilisateur, l.note,
           l.mouvement_groupe_id, l.created_at, 'sortie' as mouvement_type,
           (l.id::text || '-sortie') as display_key
    from lots_stock_matiere_premiere l
    where coalesce(l.qte_entree, 0) <= 0 and coalesce(l.qte_sortie, 0) <= 0
  ),
  with_stock as (
    select s.*,
      sum(s.qte_entree - s.qte_sortie) over (
        partition by s.article_id, coalesce(nullif(s.numero_lot, ''), s.code_normalise)
      ) as stock_code,
      sum(s.qte_entree - s.qte_sortie) over (
        partition by s.article_id
        order by s.date_jour asc nulls first, (case when s.qte_entree > 0 then 0 else 1 end), s.id asc
        rows unbounded preceding
      ) as stock_article
    from split_rows s
  ),
  joined as (
    select w.*, a.nom_article, a.gamme, a.categorie
    from with_stock w
    left join articles_matiere_premiere a on a.id = w.article_id
  ),
  filtered as (
    select j.*
    from joined j
    where matches_article_search(j.nom_article, p_article_q)
      and (p_code_q is null or btrim(p_code_q) = '' or j.numero_lot ilike '%' || p_code_q || '%')
      and (not p_hide_zero or j.stock_code > 0)
      and (
        j.date_jour is not null
        or (p_date_from is null and p_date_to is null and p_month_from is null and p_month_to is null and p_year is null)
      )
      and (p_date_from is null or j.date_jour >= p_date_from)
      and (p_date_to is null or j.date_jour <= p_date_to)
      and (p_year is null or extract(year from j.date_jour) = p_year)
      and (p_month_from is null or extract(month from j.date_jour) >= p_month_from)
      and (p_month_to is null or extract(month from j.date_jour) <= p_month_to)
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
    (select coalesce(sum(qte_sortie), 0) from paged) as total_sortie_visible
  from paged p;
$$;
