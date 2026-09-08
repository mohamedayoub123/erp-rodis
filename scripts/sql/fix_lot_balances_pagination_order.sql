-- stock_mp_lot_balances()/stock_pf_lot_balances() n'avaient aucun ORDER BY -
-- Postgres ne garantit alors AUCUN ordre stable entre deux appels
-- successifs de la meme fonction (chaque .range() cote app est une requete
-- SEPAREE). Bug reel confirme sur stock_pf_lot_balances() en construisant
-- l'inventaire PF : sur 1861 lignes recuperees par pagination (2 pages),
-- 457 etaient des doublons d'une ligne deja vue sur l'autre page (et donc
-- potentiellement des lignes jamais recuperees du tout) - provoquait une
-- violation de contrainte unique (session_id, article_id, numero_lot) des
-- qu'un doublon tombait dans le meme lot de travail. stock_mp_lot_balances()
-- n'a pas encore montre le meme symptome mais souffre du meme defaut par
-- construction (ordre non garanti sans ORDER BY) - corrige les deux.

create or replace function public.stock_mp_lot_balances()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select article_id, max(numero_lot) as numero_lot, sum(qte_entree) - sum(qte_sortie) as stock
  from public.lots_stock_matiere_premiere
  where article_id is not null and numero_lot is not null and numero_lot <> ''
  group by article_id, upper(trim(numero_lot))
  having sum(qte_entree) - sum(qte_sortie) > 0
  order by article_id, upper(trim(max(numero_lot)));
$$;

create or replace function public.stock_pf_lot_balances()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select
    article_id,
    max(coalesce(nullif(code_normalise, ''), numero_lot)) as numero_lot,
    sum(qte_entree) - sum(qte_sortie) as stock
  from public.lots_stock
  where article_id is not null
    and coalesce(nullif(code_normalise, ''), numero_lot) is not null
    and coalesce(nullif(code_normalise, ''), numero_lot) <> ''
  group by article_id, upper(trim(coalesce(nullif(code_normalise, ''), numero_lot)))
  having sum(qte_entree) - sum(qte_sortie) > 0
  order by article_id, upper(trim(coalesce(nullif(max(code_normalise), ''), max(numero_lot))));
$$;
