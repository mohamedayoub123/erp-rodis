-- Permet de marquer une ligne de programme comme terminee manuellement -
-- une fois marquee (ou une fois son reste a 0 ou depasse), elle disparait
-- des tableaux Fabrication/Conditionnement du Dashboard.
alter table public.programme_lignes
  add column if not exists programme_termine boolean not null default false,
  add column if not exists programme_termine_date date;
