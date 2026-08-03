-- Etape "Emballage" apres Conditionnement : le prevu de ce tableau vient
-- automatiquement de ce qui a deja ete conditionne (journal
-- production_carton_entries), pas d'une quantite fixe au depart.
create table if not exists public.production_emballage_entries (
  id bigint generated always as identity primary key,
  programme_ligne_id bigint not null references public.programme_lignes(id) on delete cascade,
  quantite numeric not null,
  date_jour date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists production_emballage_entries_ligne_idx
  on public.production_emballage_entries (programme_ligne_id);

-- Rapport Emballage (merge dans la meme ligne que Fabrication/
-- Conditionnement) - noms prefixes "emballage_" pour ne pas entrer en
-- collision avec les colonnes deja utilisees par Fabrication.
alter table public.production_rapports
  add column if not exists emballage_machine text,
  add column if not exists emballage_operateur text,
  add column if not exists emballage_scotcheuse text,
  add column if not exists emballage_temps_demarrer text,
  add column if not exists emballage_temps_arret text;
