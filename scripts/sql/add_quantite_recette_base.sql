-- Taille du lot pour lequel une recette est calibree : kg de vrac produit
-- (Fabrication) ou nombre de cartons produits (Conditionnement). Sert de
-- reference pour convertir chaque ligne MP entre quantite et %.
alter table articles
  add column if not exists quantite_recette_base numeric;
