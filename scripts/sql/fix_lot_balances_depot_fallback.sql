-- Corrige un vrai bug de la migration precedente
-- (restrict_lot_balances_par_depot.sql) : stock_mp_lot_balances()/
-- stock_pf_lot_balances() filtraient sur lots_stock_matiere_premiere.
-- depot_id = 3 (ou lots_stock.depot_id = 1) de facon STRICTE, ce qui exclut
-- a tort toute ligne de mouvement dont le depot n'a jamais ete renseigne
-- (depot_id NULL - 1593 lignes MP, tres frequent aussi cote PF) meme quand
-- l'article lui-meme a un depot par defaut connu.
--
-- La page Stock MP (stock_mp_display_rows, deja en prod, largement
-- utilisee) traite deja ce cas correctement avec un repli sur le depot par
-- defaut de l'article : coalesce(lot.depot_id, article.depot_id) = depot
-- cible - jamais applique ici, d'ou l'ecart confirme sur donnees reelles
-- (BASE ALD 22307, lot "ancien-lot" : Inventaire affichait 2980,16
-- - stock reel du Depot E seul, sans le repli - au lieu de 2922,1556,
-- le vrai total Depot E une fois les 58 en mouvements sans depot ajoutes,
-- exactement ce que confirme Stock MP filtre sur Depot E).
--
-- Cote PF, articles.depot_id est bien renseigne pour la grande majorite du
-- catalogue (756/959 = Depot A sur un echantillon) alors que
-- lots_stock.depot_id est presque toujours vide - ce correctif change donc
-- fortement la couverture de l'Inventaire PF (bien plus d'articles/lots
-- trouves qu'avant, qui ne renvoyait quasiment rien).
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

create or replace function public.stock_mp_lot_balances()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select l.article_id, max(l.numero_lot) as numero_lot, sum(l.qte_entree) - sum(l.qte_sortie) as stock
  from public.lots_stock_matiere_premiere l
  join public.articles_matiere_premiere a on a.id = l.article_id
  where l.article_id is not null and l.numero_lot is not null and l.numero_lot <> ''
    and coalesce(l.depot_id, a.depot_id) = 3 -- Depot E
  group by l.article_id, upper(trim(l.numero_lot))
  having sum(l.qte_entree) - sum(l.qte_sortie) > 0
  order by l.article_id, upper(trim(max(l.numero_lot)));
$$;

create or replace function public.stock_pf_lot_balances()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select
    l.article_id,
    max(coalesce(nullif(l.code_normalise, ''), l.numero_lot)) as numero_lot,
    sum(l.qte_entree) - sum(l.qte_sortie) as stock
  from public.lots_stock l
  join public.articles a on a.id = l.article_id
  where l.article_id is not null
    and coalesce(nullif(l.code_normalise, ''), l.numero_lot) is not null
    and coalesce(nullif(l.code_normalise, ''), l.numero_lot) <> ''
    and coalesce(l.depot_id, a.depot_id) = 1 -- Depot A
  group by l.article_id, upper(trim(coalesce(nullif(l.code_normalise, ''), l.numero_lot)))
  having sum(l.qte_entree) - sum(l.qte_sortie) > 0
  order by l.article_id, upper(trim(coalesce(nullif(max(l.code_normalise), ''), max(l.numero_lot))));
$$;
