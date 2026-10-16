-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Listes des noms "Chef de zone", "Chef de ligne" et "Ravitailleur" du Conditionnement : page Production > "Noms Conditionnement".
-- Ces noms s'affichent en liste de choix dans Entrer, Entrer par ligne et la nouvelle fiche (+) Conditionnement ; quand une liste
-- contient au moins un nom, on ne peut choisir que dans cette liste (tant qu'elle est vide, la saisie reste libre).
-- Idempotent (peut etre relance sans risque), aucune donnee existante modifiee.
create table if not exists public.conditionnement_noms (
  id bigserial primary key,
  type text not null check (type in ('chef_zone', 'chef_ligne', 'ravitailleur')),
  nom text not null,
  cree_par text,
  created_at timestamptz not null default now()
);

-- Un meme nom ne peut pas etre ajoute deux fois dans la meme liste (majuscules/minuscules ignorees)
create unique index if not exists conditionnement_noms_type_nom_unique
  on public.conditionnement_noms (type, lower(nom));
