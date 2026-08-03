-- Date de fabrication et date de peremption saisies sur le rapport
-- Conditionnement (distinctes de la date de l'entree du journal
-- production_carton_entries, qui reste "quand le carton a ete produit").
alter table public.production_rapports
  add column if not exists date_fabrication_conditionnement date,
  add column if not exists date_peremption date;
