-- Statut de suivi manuel d'un dossier Import MP (Fabrication -> Import ->
-- Receptionne au port -> Receptionne Rodis). Un "dossier" n'a pas de table
-- propre - identifie par la paire (n_doss_4d, n_doss_erp), comme
-- bons_commande_mp_imports.
create table if not exists public.dossiers_import_mp_statut (
  id bigint generated always as identity primary key,
  n_doss_4d text,
  n_doss_erp text,
  statut text not null default 'Fabrication',
  updated_at timestamptz not null default now()
);

create index if not exists dossiers_import_mp_statut_dossier_idx
  on public.dossiers_import_mp_statut (n_doss_4d, n_doss_erp);
