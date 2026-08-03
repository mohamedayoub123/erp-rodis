-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Assignation fixe d'un ravitailleur par ligne (zone + chaine), separee du
-- planning quotidien "Programme par ligne" - une seule ligne par position,
-- mise a jour (pas un nouvel enregistrement a chaque fois).
create table if not exists public.ravitailleur_lignes (
  id bigserial primary key,
  position text not null,
  zone text not null,
  chaine text not null,
  ravitailleur text,
  updated_at timestamptz not null default now(),
  unique (position)
);
