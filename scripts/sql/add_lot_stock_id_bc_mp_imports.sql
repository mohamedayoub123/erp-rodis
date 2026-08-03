-- Relie un evenement d'import a la ligne de stock qu'il a creee (uniquement
-- pour les evenements issus d'une Reception, pas de "Creer import" qui ne
-- touche pas le stock) - permet de retirer proprement le stock credite
-- quand on supprime un import/dossier/ligne BC, au lieu de laisser une
-- ligne de stock orpheline.
alter table public.bons_commande_mp_imports
  add column if not exists lot_stock_id bigint references public.lots_stock_matiere_premiere(id) on delete set null;
