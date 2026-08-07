alter table public.machine_produits
  add column if not exists capacite numeric,
  add column if not exists capacite_min numeric,
  add column if not exists capacite_max numeric;
