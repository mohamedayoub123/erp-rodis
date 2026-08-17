-- Charges/consommations de l'usine, saisies une fois par mois, pour
-- alimenter plus tard des graphes/calculs (Rapport Charges) - une ligne par
-- (annee, mois), re-saisir le meme mois corrige la ligne existante au lieu
-- d'en creer une 2eme (upsert cote TS sur la contrainte unique ci-dessous).
-- A executer dans Supabase Dashboard > SQL Editor.
create table if not exists public.charges_usine (
  id bigserial primary key,
  annee int not null,
  mois int not null check (mois between 1 and 12),
  electricite_plastique numeric,
  electricite_cosmetique numeric,
  gaz numeric,
  gasoil_plastique numeric,
  gasoil_cosmetique numeric,
  essence numeric,
  salaire_journalier_cosmetique numeric,
  salaire_journalier_global numeric,
  salaire_cadre numeric,
  depense_usine numeric,
  utilisateur text,
  date_saisie timestamptz not null default now(),
  unique (annee, mois)
);

create index if not exists charges_usine_annee_mois_idx on public.charges_usine (annee desc, mois desc);
