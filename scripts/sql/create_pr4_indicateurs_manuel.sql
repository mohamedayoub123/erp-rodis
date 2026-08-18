-- Saisie manuelle des indicateurs PR4 pour les mois anciens (ex: fichier
-- Excel "Objectif et INDICATEUR PR4 cosmetique.xlsx") ou l'ERP n'a pas
-- encore de donnee automatique. Utilisee en repli uniquement quand le
-- calcul automatique de PR4 ne trouve rien pour ce mois-la, indicateur par
-- indicateur. A executer dans Supabase Dashboard > SQL Editor.
create table if not exists public.pr4_indicateurs_manuel (
  id bigserial primary key,
  annee int not null,
  mois int not null check (mois between 1 and 12),
  carton_commande numeric,
  carton_fabrique numeric,
  capacite_pct numeric,
  test_labo_preparations numeric,
  test_labo_a_detruire numeric,
  test_labo_sous_derogation numeric,
  vrac_fabrique_kg numeric,
  carton_fabrique_kg numeric,
  arret_minutes numeric,
  travail_minutes numeric,
  pieces_fabriquees numeric,
  dechet_pieces numeric,
  prix_carton numeric,
  utilisateur text,
  date_saisie timestamptz not null default now(),
  unique (annee, mois)
);

create index if not exists pr4_indicateurs_manuel_annee_mois_idx
  on public.pr4_indicateurs_manuel (annee desc, mois desc);
