-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Depot B : ne garder comme VRAC que ce qui est enregistre dans le module "Vrac a recuperer" (source web:vrac-a-recuperer).
-- Supprime les mouvements de vrac du Depot B crees par la Fabrication (source web:fabrication-recuperation) qui ne concernent
-- PAS un lot du module :
--   - 43 entrees "Fabrication vrac mis de cote" (1 105 kg de stock qui disparait),
--   - 84 sorties "Recuperation vrac" de lots qui n'ont jamais ete enregistres dans le module (ex : BDG0038, BDG0039).
-- Les 11 lots du module (AZAK0037, AZAK0035, BCA0008V, BCA0021, ATB0032, AZAAM0049, AZAAM0053, AZCK0008, AZCAM0001V, AZCAM0013,
-- BA0050V) et leurs 45 sorties de recuperation ne sont PAS touches. Aucune quantite de production (vrac produit) n'est modifiee.
--
-- 1) Sauvegarde des lignes qui vont etre supprimees (pour pouvoir revenir en arriere)
create table if not exists public.lots_stock_sauvegarde_vrac_depot_b_20261014 as
select m.*
from public.lots_stock m
where m.source_import = 'web:fabrication-recuperation'
  and m.depot_id = 2
  and not exists (
    select 1 from public.lots_stock x
    where x.source_import = 'web:vrac-a-recuperer'
      and x.depot_id = 2
      and x.article_id = m.article_id
      and x.numero_lot = m.numero_lot
  );

-- 2) Suppression
delete from public.lots_stock
where id in (select id from public.lots_stock_sauvegarde_vrac_depot_b_20261014);

-- 3) Controle : il ne doit rester que les 11 lots du module
select article_id, numero_lot, round(sum(qte_entree - qte_sortie)::numeric, 2) as solde
from public.lots_stock
where depot_id = 2
  and source_import in ('web:vrac-a-recuperer', 'web:fabrication-recuperation')
group by article_id, numero_lot
order by numero_lot;

-- Pour annuler (si besoin) :
-- insert into public.lots_stock select * from public.lots_stock_sauvegarde_vrac_depot_b_20261014;
