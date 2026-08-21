-- A coller dans Supabase Dashboard > SQL Editor > New query (3/3).
-- Table Fournisseurs (miroir exact de public.clients) - utilisee par le
-- Module Comptabilite (contrepartie de l'ecriture "Achat/Fournisseur") et
-- par la nouvelle page /fournisseurs.
create table if not exists public.fournisseurs (
  id bigserial primary key,
  nom_fournisseur text not null,
  fournisseur_normalise text not null unique,
  pays text,
  created_at timestamptz not null default now()
);
