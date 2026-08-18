-- Plan de formation cosmetique (PR4 > Formation) - reprend le fichier Excel
-- "GFPC-ENR-015 Plan de formation cosmetique.xlsx" (1 sheet par annee).
-- Une ligne = une formation (ou une ligne bilan "Formation realisee/ratee")
-- pour une annee donnee, avec 12 mois x (planifie + detail date en texte
-- libre, car certaines dates Excel sont des listes "24&30/06/2025").
create table if not exists pr4_formation_plan (
  id bigint generated always as identity primary key,
  annee int not null,
  categorie text,
  formation text not null,
  ordre int not null default 0,
  est_bilan boolean not null default false,
  m1_planifie boolean not null default false,
  m1_date text,
  m2_planifie boolean not null default false,
  m2_date text,
  m3_planifie boolean not null default false,
  m3_date text,
  m4_planifie boolean not null default false,
  m4_date text,
  m5_planifie boolean not null default false,
  m5_date text,
  m6_planifie boolean not null default false,
  m6_date text,
  m7_planifie boolean not null default false,
  m7_date text,
  m8_planifie boolean not null default false,
  m8_date text,
  m9_planifie boolean not null default false,
  m9_date text,
  m10_planifie boolean not null default false,
  m10_date text,
  m11_planifie boolean not null default false,
  m11_date text,
  m12_planifie boolean not null default false,
  m12_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pr4_formation_plan_annee_idx on pr4_formation_plan (annee, ordre);
