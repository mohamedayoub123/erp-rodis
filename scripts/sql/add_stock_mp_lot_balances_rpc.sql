-- La page Sortie MP est devenue lente (~12s) depuis l'ajout du picker de
-- lot existant : elle rapatriait TOUTE la table lots_stock_matiere_premiere
-- (dizaines de milliers de lignes, dont l'import historique de 39.5k) page
-- par page pour calculer le solde par article+lot cote Node. Cette fonction
-- fait le meme calcul (somme qte_entree - qte_sortie, groupe par
-- article+lot, ne garde que le solde positif) directement en base, en une
-- seule requete.
create or replace function public.stock_mp_lot_balances()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select
    article_id,
    max(numero_lot) as numero_lot,
    sum(qte_entree) - sum(qte_sortie) as stock
  from public.lots_stock_matiere_premiere
  where article_id is not null and numero_lot is not null and numero_lot <> ''
  group by article_id, upper(trim(numero_lot))
  having sum(qte_entree) - sum(qte_sortie) > 0;
$$;

revoke all on function public.stock_mp_lot_balances() from public;
grant execute on function public.stock_mp_lot_balances() to service_role;
