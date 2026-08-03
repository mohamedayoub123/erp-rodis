-- Date de peremption du lot, transferee depuis le rapport Conditionnement
-- (ou modifiee a la main) au moment de l'entree en stock produit fini.
alter table public.lots_stock
  add column if not exists date_peremption date;
