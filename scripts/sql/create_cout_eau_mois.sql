-- Module "Eau" (Cout) : deux pages, toutes deux enregistrees PAR MOIS.
--   1. Eau - Prix                  -> cout_eau_mois  (prix d'une unite de chaque element)
--   2. Eau - Consommation par mois -> cout_eau_conso (quantites consommees dans le mois)
-- Chaque "Save" cree (ou remplace) la ligne du mois choisi ; l'historique liste
-- tous les mois enregistres et chaque ligne rouvre les valeurs de ce mois.
--
-- Remplace la table cout_eau_config (ligne unique, jamais utilisee en
-- production : elle est vide), qui n'est plus lue par l'application et peut
-- etre supprimee plus tard. Aucune donnee existante n'est modifiee. Peut etre
-- relance sans danger.
create table if not exists public.cout_eau_mois (
  annee integer not null,
  mois integer not null check (mois between 1 and 12),
  donnees jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (annee, mois)
);

create table if not exists public.cout_eau_conso (
  annee integer not null,
  mois integer not null check (mois between 1 and 12),
  donnees jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (annee, mois)
);

alter table public.cout_eau_mois enable row level security;
alter table public.cout_eau_conso enable row level security;
