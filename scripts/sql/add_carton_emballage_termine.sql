-- "Fin programme" du Dashboard fermait les 3 colonnes (Fabrication/
-- Conditionnement/Emballage) d'un coup via un seul flag partage
-- (programme_termine). Chaque colonne a maintenant son propre flag "termine"
-- - fermer Fabrication ne touche plus Conditionnement/Emballage et
-- inversement. vrac_termine existait deja (Fabrication) ; on ajoute les
-- deux autres.
alter table public.programme_lignes
  add column if not exists carton_termine boolean not null default false,
  add column if not exists carton_termine_date date,
  add column if not exists emballage_termine boolean not null default false,
  add column if not exists emballage_termine_date date;
