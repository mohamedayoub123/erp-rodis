-- Inventaire MP/PF : ne compte que le stock d'un depot precis par famille -
-- Depot E (id 3) pour la MP, Depot A (id 1) pour le PF - demande explicite
-- de l'utilisateur. Avant ce correctif, stock_mp_lot_balances()/
-- stock_pf_lot_balances() sommaient qte_entree/qte_sortie sur TOUS les
-- depots confondus (aucun filtre depot_id) - un article present dans
-- plusieurs depots (Depot B, E, F, RD pour la MP) etait compte une seule
-- fois avec son total combine, alors que l'inventaire physique ne se fait
-- que dans un depot precis par famille.
--
-- Attention PF : lots_stock.depot_id est vide (null) sur la quasi-totalite
-- des lignes existantes (import historique sans depot renseigne) - avec ce
-- filtre, stock_pf_lot_balances() ne retournera donc presque plus rien tant
-- que le depot n'est pas saisi sur ces lignes. Applique quand meme sur
-- demande explicite de l'utilisateur, qui en a ete informe.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

create or replace function public.stock_mp_lot_balances()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select article_id, max(numero_lot) as numero_lot, sum(qte_entree) - sum(qte_sortie) as stock
  from public.lots_stock_matiere_premiere
  where article_id is not null and numero_lot is not null and numero_lot <> ''
    and depot_id = 3 -- Depot E
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
    and depot_id = 1 -- Depot A
  group by article_id, upper(trim(coalesce(nullif(code_normalise, ''), numero_lot)))
  having sum(qte_entree) - sum(qte_sortie) > 0
  order by article_id, upper(trim(coalesce(nullif(max(code_normalise), ''), max(numero_lot))));
$$;
