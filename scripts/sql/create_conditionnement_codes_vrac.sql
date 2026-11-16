-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Dashboard > Conditionnement : la colonne N Lot est VIDE au depart, c'est la personne qui choisit le ou les CODES VRAC
-- (Fabrication deja faite) qu'elle conditionne sur cette ligne, avec la quantite de vrac (kg) prise sur chaque code.
-- Une ligne = un choix (ligne de programme + son code de programme -> code vrac + quantite). Le reste de vrac d'un code
-- (fabrique - quantites choisies - cartons deja conditionnes sous son propre code) reste disponible pour une autre ligne.
-- Script relancable sans risque (create ... if not exists).
create table if not exists public.conditionnement_codes_vrac (
  id bigserial primary key,
  programme_ligne_id bigint not null references public.programme_lignes(id) on delete cascade,
  -- code de la ligne de programme (celui qui sert de cle au Conditionnement / Emballage de la ligne)
  code text not null,
  -- code du vrac choisi (le numero de lot du produit fini)
  code_vrac text not null,
  quantite_vrac numeric not null check (quantite_vrac > 0),
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists conditionnement_codes_vrac_ligne_idx
  on public.conditionnement_codes_vrac (programme_ligne_id, code);

create index if not exists conditionnement_codes_vrac_code_vrac_idx
  on public.conditionnement_codes_vrac (code_vrac);
