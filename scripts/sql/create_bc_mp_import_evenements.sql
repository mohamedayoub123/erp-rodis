-- Chaque "import" (reception partielle ou totale) d'une ligne de commande
-- (bons_commande_matiere_premiere) est son propre evenement, pas une valeur
-- ecrasee a chaque fois - un article commande en 100 peut arriver en
-- plusieurs fois (90 puis 10), chacune avec son propre dossier 4D/ERP.
create table if not exists public.bons_commande_mp_imports (
  id bigint generated always as identity primary key,
  bc_ligne_id bigint not null references public.bons_commande_matiere_premiere(id) on delete cascade,
  quantite_importee numeric not null,
  n_doss_4d_import text,
  n_doss_erp_import text,
  date_import date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists bons_commande_mp_imports_ligne_idx
  on public.bons_commande_mp_imports (bc_ligne_id);

create index if not exists bons_commande_mp_imports_dossier_idx
  on public.bons_commande_mp_imports (n_doss_4d_import, n_doss_erp_import);
