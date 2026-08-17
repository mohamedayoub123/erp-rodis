-- Meme raison et meme motif que stock_mp_display_rows (add_stock_mp_display_rpc.sql)
-- applique a Stock PF (app/stock, table lots_stock, 16 000+ lignes).

create or replace function stock_pf_display_rows(
  p_article_q text default null,
  p_code_q text default null,
  p_chambre_q text default null,
  p_pays_q text default null,
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
  type_article text,
  marque text,
  gamme text,
  mouvement_type text,
  numero_lot text,
  date_fabrication date,
  date_jour date,
  qte_entree numeric,
  qte_sortie numeric,
  stock_code numeric,
  stock_article numeric,
  chambre text,
  code_pays text,
  note text,
  created_at timestamptz,
  source_import text,
  total_rows bigint,
  total_entree_visible numeric,
  total_sortie_visible numeric
)
language sql
stable
as $$
  -- Meme optimisation que stock_mp_display_rows : la table est lue UNE
  -- SEULE fois (LATERAL) au lieu de 3 fois (une par UNION ALL).
  with split_rows as (
    select l.id, l.article_id, l.numero_lot, l.date_fabrication, l.date_jour,
           v.qte_entree, v.qte_sortie, v.mouvement_type,
           (l.id::text || '-' || v.mouvement_type) as display_key,
           l.chambre, l.code_pays, l.note, l.created_at, l.source_import
    from lots_stock l
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
  with_stock as (
    select s.*,
      sum(s.qte_entree - s.qte_sortie) over (
        partition by s.article_id, s.numero_lot
      ) as stock_code,
      sum(s.qte_entree - s.qte_sortie) over (
        partition by s.article_id
        order by s.date_jour asc nulls first, (case when s.qte_entree > 0 then 0 else 1 end), s.id asc
        rows unbounded preceding
      ) as stock_article
    from split_rows s
  ),
  joined as (
    select w.*, a.nom_article, a.type_article, a.marque, a.gamme
    from with_stock w
    left join articles a on a.id = w.article_id
  ),
  filtered as (
    select j.*
    from joined j
    -- L'ancienne page JS cherchait article_q sur 4 colonnes (nom, type, marque,
    -- gamme) via ILIKE substring, pas seulement le nom comme matches_article_search
    -- (utilise pour Stock MP) - meme comportement reproduit ici a l'identique.
    where (
        p_article_q is null or btrim(p_article_q) = ''
        or j.nom_article ilike '%' || p_article_q || '%'
        or j.type_article ilike '%' || p_article_q || '%'
        or j.marque ilike '%' || p_article_q || '%'
        or j.gamme ilike '%' || p_article_q || '%'
      )
      and (p_code_q is null or btrim(p_code_q) = '' or j.numero_lot ilike '%' || p_code_q || '%')
      and (p_chambre_q is null or btrim(p_chambre_q) = '' or j.chambre ilike '%' || p_chambre_q || '%')
      and (p_pays_q is null or btrim(p_pays_q) = '' or j.code_pays ilike '%' || p_pays_q || '%')
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
    p.display_key, p.id, p.article_id, p.nom_article, p.type_article, p.marque, p.gamme, p.mouvement_type,
    p.numero_lot, p.date_fabrication, p.date_jour, p.qte_entree, p.qte_sortie, p.stock_code, p.stock_article,
    p.chambre, p.code_pays, p.note, p.created_at, p.source_import,
    p.total_rows,
    (select coalesce(sum(qte_entree), 0) from paged) as total_entree_visible,
    (select coalesce(sum(qte_sortie), 0) from paged) as total_sortie_visible
  from paged p;
$$;
