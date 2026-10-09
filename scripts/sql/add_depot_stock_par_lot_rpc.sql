-- Page Depot (/depots/[id]) : a chaque ouverture ET a chaque filtre, la page telechargeait TOUS les mouvements de
-- stock (67 000 lignes de matiere premiere + 24 000 de produit fini, lues 1000 par 1000 : environ 40 secondes)
-- uniquement pour en faire des sommes par article + lot DANS UN DEPOT. Ces deux fonctions font la meme somme
-- directement dans la base et ne renvoient que les lignes de CE depot (quelques centaines).
--
-- Memes regles que le calcul qu'elles remplacent (app/depots/[id]) :
--   - le depot d'une ligne = son depot_id, sinon le depot PAR DEFAUT de son article ;
--   - solde = somme entree - sortie, par article + numero de lot (espaces autour du lot retires) ;
--   - les lots dont le solde est nul (a 0,000001 pres) ne sont pas renvoyes ;
--   - produit fini : "statut" d'un lot de vrac = Conforme / A recuperer, d'apres la derniere ligne dont la note
--     commence par "Fabrication vrac" (tous depots confondus, comme avant).
-- Renvoie un seul jsonb (tableau) : une table serait tronquee a 1000 lignes par l'API.
-- Lecture seule - ne modifie aucune donnee. A coller dans Supabase Dashboard > SQL Editor > New query.

create or replace function public.depot_stock_par_lot_mp(p_depot_id bigint)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'article_id', t.article_id,
    'numero_lot', t.numero_lot,
    'solde', t.solde
  ) order by t.article_id, t.numero_lot), '[]'::jsonb)
  from (
    select
      l.article_id,
      regexp_replace(coalesce(l.numero_lot, ''), '^\s+|\s+$', '', 'g') as numero_lot,
      sum(coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0)) as solde
    from public.lots_stock_matiere_premiere l
    left join public.articles_matiere_premiere a on a.id = l.article_id
    where l.article_id is not null
      and coalesce(l.depot_id, a.depot_id) = p_depot_id
    group by l.article_id, regexp_replace(coalesce(l.numero_lot, ''), '^\s+|\s+$', '', 'g')
    having abs(sum(coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0))) > 0.000001
  ) t;
$$;

create or replace function public.depot_stock_par_lot_pf(p_depot_id bigint)
returns jsonb
language sql
stable
as $$
  with statuts as (
    select distinct on (l.article_id, regexp_replace(coalesce(l.numero_lot, ''), '^\s+|\s+$', '', 'g'))
      l.article_id,
      regexp_replace(coalesce(l.numero_lot, ''), '^\s+|\s+$', '', 'g') as numero_lot,
      case when l.note like '%A recuperer%' then 'A recuperer' else 'Conforme' end as statut
    from public.lots_stock l
    where l.article_id is not null and l.note like 'Fabrication vrac%'
    order by l.article_id, regexp_replace(coalesce(l.numero_lot, ''), '^\s+|\s+$', '', 'g'), l.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'article_id', t.article_id,
    'numero_lot', t.numero_lot,
    'solde', t.solde,
    'statut', s.statut
  ) order by t.article_id, t.numero_lot), '[]'::jsonb)
  from (
    select
      l.article_id,
      regexp_replace(coalesce(l.numero_lot, ''), '^\s+|\s+$', '', 'g') as numero_lot,
      sum(coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0)) as solde
    from public.lots_stock l
    left join public.articles a on a.id = l.article_id
    where l.article_id is not null
      and coalesce(l.depot_id, a.depot_id) = p_depot_id
    group by l.article_id, regexp_replace(coalesce(l.numero_lot, ''), '^\s+|\s+$', '', 'g')
    having abs(sum(coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0))) > 0.000001
  ) t
  left join statuts s on s.article_id = t.article_id and s.numero_lot = t.numero_lot;
$$;

revoke all on function public.depot_stock_par_lot_mp(bigint) from public;
revoke all on function public.depot_stock_par_lot_pf(bigint) from public;
grant execute on function public.depot_stock_par_lot_mp(bigint) to service_role;
grant execute on function public.depot_stock_par_lot_pf(bigint) to service_role;
