-- Eau - Consommation par mois : chaque consommation est saisie AVEC SA DATE
-- (ex. filtre 10 micron change le 12/09 : 1 piece, Ligne 1). Plusieurs saisies
-- possibles dans le meme mois ; la page affiche les saisies datees du mois
-- choisi et leur total.
--
-- Remplace la table cout_eau_conso (un seul tableau par mois, sans date), qui
-- n'est plus lue par l'application : elle est vide et peut etre supprimee plus
-- tard. Aucune donnee existante n'est modifiee. Peut etre relance sans danger.
create table if not exists public.cout_eau_conso_saisies (
  id bigint generated always as identity primary key,
  date_jour date not null,
  -- Element (filtre_10, sel, electricite... ou perso_xxx pour un element ajoute)
  cle text not null,
  libelle text not null,
  ligne1 numeric,
  ligne2 numeric,
  unite text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists cout_eau_conso_saisies_date_idx
  on public.cout_eau_conso_saisies (date_jour, id);

alter table public.cout_eau_conso_saisies enable row level security;
