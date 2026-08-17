-- Quantite de vrac necessaire a la recette (Recette Conditionnement) -
-- jusqu'ici toujours recalculee (nb cartons x piece/carton x contenance),
-- jamais modifiable. Colonne optionnelle : si renseignee, remplace le
-- calcul automatique partout ou cette quantite est affichee/utilisee.
alter table articles add column if not exists vrac_quantite_recette numeric;
