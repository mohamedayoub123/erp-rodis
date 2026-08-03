-- Marque une entree du journal emballage comme deja transferee en stock
-- produit fini (via "Entree Production") - evite de la reproposer une
-- 2eme fois dans la page de revue.
alter table public.production_emballage_entries
  add column if not exists transfere_stock boolean not null default false;
