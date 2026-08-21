-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Correctif retroactif, PAS une migration de schema (rien a rejouer plus
-- tard) - pour les 3 codes de la ligne 7838 (AA4263V, AA4264V, AA4265V),
-- "Fin programme" Salle de conditionnement a deja ete cliquee (313+313+
-- 311.5 CARTON, 15024+15024+14952 SLEEVE, Lait White Secret 200ml, Depot
-- B) mais la reservation MP n'a jamais ete convertie en vraie sortie de
-- stock (bug corrige dans le code, voir app/production/suivi/actions.ts -
-- consommerRemainingMpReserve, avant releaseRemainingMpReserve qui ne
-- faisait que liberer la reservation sans jamais toucher au stock reel).
-- Ce script fait manuellement ce que le code aurait du faire a l'epoque :
-- une sortie de stock par ligne de reservation encore active, puis remet
-- sa quantite a 0 pour ne pas la compter 2 fois si le code venait a re-
-- tourner dessus.
insert into public.lots_stock_matiere_premiere
  (article_id, numero_lot, qte_entree, qte_sortie, depot_id, date_jour, utilisateur, note)
select
  r.article_mp_id,
  r.numero_lot,
  0,
  r.quantite,
  r.depot_id,
  current_date,
  'correctif-reserve-mp',
  'Consommation production (correctif retroactif - Fin programme Conditionnement code ' || ct.code || ', reservation jamais sortie du stock)'
from public.production_mp_reserve r
join public.production_code_termine ct on ct.id = r.production_code_termine_id
where ct.programme_ligne_id = 7838
  and ct.stage = 'salle_conditionnement'
  and r.quantite > 0;

update public.production_mp_reserve r
set quantite = 0
from public.production_code_termine ct
where ct.id = r.production_code_termine_id
  and ct.programme_ligne_id = 7838
  and ct.stage = 'salle_conditionnement'
  and r.quantite > 0;
