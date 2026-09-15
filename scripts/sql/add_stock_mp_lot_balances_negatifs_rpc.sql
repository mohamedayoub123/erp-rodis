-- Meme principe que stock_mp_lot_balances() (voir
-- fix_lot_balances_pagination_order.sql) mais garde les lots en STOCK
-- NEGATIF (having < 0) au lieu de les exclure - demande explicite : "donne
-- moi tous les articles avec les codes qui ont stock negatif". Un lot
-- negatif est une anomalie de saisie (plus sorti qu'entre), jamais un cas
-- normal - sert a les retrouver pour corriger.

create or replace function public.stock_mp_lot_balances_negatifs()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select article_id, max(numero_lot) as numero_lot, sum(qte_entree) - sum(qte_sortie) as stock
  from public.lots_stock_matiere_premiere
  where article_id is not null and numero_lot is not null and numero_lot <> ''
  group by article_id, upper(trim(numero_lot))
  having sum(qte_entree) - sum(qte_sortie) < 0
  order by article_id, upper(trim(max(numero_lot)));
$$;
