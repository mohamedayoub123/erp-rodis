-- Suivi Production : numero de lot editable sur chaque ligne de programme.
alter table public.programme_lignes
  add column if not exists numero_lot text;

-- Suivi Production : rapport de poste/batch rempli depuis le Dashboard
-- (une ligne de programme peut avoir plusieurs rapports, un par poste/jour).
create table if not exists public.production_rapports (
  id bigint generated always as identity primary key,
  programme_ligne_id bigint not null references public.programme_lignes(id) on delete cascade,
  chef_zone text,
  chef_ligne text,
  ravitailleur text,
  tireur text,
  qt_fabriquer numeric,
  cadence numeric,
  poids_reel numeric,
  dechet_sleeve numeric,
  dechet_capsule numeric,
  dechet_pompe numeric,
  dechet_flacon numeric,
  dechet_pot numeric,
  dechet_etiquette numeric,
  arret_cause text,
  temps_demarage_lot time,
  temps_arret_batch time,
  created_at timestamptz not null default now()
);

create index if not exists production_rapports_ligne_idx
  on public.production_rapports (programme_ligne_id);
