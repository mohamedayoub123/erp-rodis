-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- Bug : crediterVracFabrique (Fabrication) et consommerVracConditionnement
-- (Conditionnement) inseraient dans lots_stock sans jamais renseigner
-- date_fabrication (colonne NOT NULL) - corrige dans le code (commit
-- c31b6e6). Consequence concrete sur le code AA4200V (ligne 9, vrac lait
-- white secret) : le Save Fabrication (vrac_fabrique=2950) a plante APRES
-- avoir deja enregistre le rapport (production_rapports.vrac_fabrique=2950)
-- mais AVANT de crediter le stock reel Depot B (aucune ligne "Fabrication
-- vrac" dans lots_stock). Le Save Conditionnement (vrac_consomme=2880), lui,
-- a reussi APRES la correction du code et a bien sorti 2880 du stock -
-- resultat : Depot B affiche -2880 sur "vrac lait white secret" au lieu de
-- 70 (2950 produits - 2880 consommes).
--
-- Cette correction insere la ligne de credit manquante, avec les valeurs
-- exactement telles qu'elles auraient ete inserees par crediterVracFabrique
-- si l'insert n'avait pas plante (numero_lot AA4200V, meme depot, date de
-- fabrication reellement saisie sur le rapport).
insert into public.lots_stock
  (article_id, numero_lot, code_normalise, qte_entree, qte_sortie, depot_id, date_jour, date_fabrication, utilisateur, note)
values
  (6343, 'AA4200V', 'AA4200V', 2950, 0, 3, '2026-08-10', '2026-08-01', 'ayoub', 'Fabrication vrac');

-- Verification : le solde de "vrac lait white secret" au Depot B doit
-- maintenant etre 2950 - 2880 = 70.
select
  sum(qte_entree) as total_entree,
  sum(qte_sortie) as total_sortie,
  sum(qte_entree) - sum(qte_sortie) as solde
from public.lots_stock
where article_id = 6343 and depot_id = 3;
