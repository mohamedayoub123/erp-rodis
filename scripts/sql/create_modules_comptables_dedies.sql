-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- 4 tables pour les modules comptables dedies (Paie, Charges recurrentes,
-- Immobilisations, TVA) - chaque "periode deja traitee" est retrouvee via
-- ecritures_comptables.source_type/source_id (meme convention deja utilisee
-- partout ailleurs dans l'appli), jamais une table de paiement separee.

-- 1. Paie
create table if not exists public.employes (
  id bigserial primary key,
  nom text not null,
  poste text,
  salaire_mensuel numeric not null default 0,
  compte_charge_code text not null default '66100000',
  compte_contrepartie_code text not null default '571000',
  actif boolean not null default true,
  date_embauche date,
  cree_par text,
  created_at timestamptz not null default now()
);

-- 2. Charges recurrentes (loyer, assurance, abonnements...)
create table if not exists public.charges_recurrentes (
  id bigserial primary key,
  nom text not null,
  categorie text not null default 'autre',
  montant numeric not null default 0,
  compte_charge_code text not null,
  compte_contrepartie_code text not null default '571000',
  actif boolean not null default true,
  cree_par text,
  created_at timestamptz not null default now()
);

-- 3. Immobilisations (materiel, batiments...) + amortissement lineaire
create table if not exists public.immobilisations (
  id bigserial primary key,
  nom text not null,
  categorie text,
  date_acquisition date not null,
  valeur_acquisition numeric not null,
  duree_amortissement_mois integer not null,
  compte_immobilisation_code text not null,
  compte_amortissement_code text not null,
  compte_dotation_code text not null default '68120000',
  compte_contrepartie_code text not null default '571000',
  statut text not null default 'actif',
  cree_par text,
  created_at timestamptz not null default now()
);

-- 4. Declarations TVA (periode, collectee vs deductible, ecriture de
-- regularisation du solde a payer/a recuperer)
create table if not exists public.declarations_tva (
  id bigserial primary key,
  periode text not null unique,
  tva_collectee numeric not null default 0,
  tva_deductible numeric not null default 0,
  compte_tva_collectee_code text not null default '44320000',
  compte_tva_deductible_code text not null default '44520000',
  compte_etat_code text not null default '44410000',
  date_declaration date not null,
  cree_par text,
  created_at timestamptz not null default now()
);
