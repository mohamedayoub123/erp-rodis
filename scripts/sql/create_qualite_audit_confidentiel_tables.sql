-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Deux tableaux de suivi audit interne (issus du classeur Excel
-- "CCSIQP-ENR-053 Suivi NC & TAF audit Interne", feuilles "NC Confidentiel"
-- et "TAF Confidentiel") - memes titres de colonnes que l'Excel, tout en
-- texte libre pour rester fidele a la saisie originale.

create table if not exists public.qualite_nc_confidentiel (
  id bigserial primary key,
  audit text,
  numero text,
  constat text,
  classe text,
  processus_concerne text,
  service_concerne text,
  norme_concernee text,
  chapitre text,
  sous_chapitre text,
  sous_sous_chapitre text,
  correction text,
  responsable_correction text,
  delais_correction text,
  commentaire text,
  statut_correction text,
  analyse_causes text,
  action_corrective_ac text,
  responsable_ac text,
  delais_ac text,
  commentaire2 text,
  statut_ac text,
  methode_mesure_efficacite_ac text,
  mesure_efficacite_ac text,
  realise_par text,
  commentaire3 text,
  statut_cloture text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qualite_taf_confidentiel (
  id bigserial primary key,
  audit text,
  numero text,
  constat text,
  processus_concerne text,
  service_concerne text,
  qui text,
  delais text,
  norme_concernee text,
  chapitre text,
  sous_chapitre text,
  sous_sous_chapitre text,
  commentaire text,
  t1 text,
  t2 text,
  t3 text,
  t4 text,
  tx_progression text,
  statut text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
