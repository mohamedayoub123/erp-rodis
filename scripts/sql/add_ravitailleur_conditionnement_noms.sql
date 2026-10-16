-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute la liste "Ravitailleur" aux noms du Conditionnement (page Production > Noms Conditionnement), a cote de Chef de zone et
-- Chef de ligne : meme liste de choix dans Entrer, Entrer par ligne et la fiche + (un nom absent de la liste est refuse).
-- Seule la regle "type autorise" de la table conditionnement_noms change ; aucun nom existant n'est modifie. Idempotent.
alter table public.conditionnement_noms drop constraint if exists conditionnement_noms_type_check;
alter table public.conditionnement_noms
  add constraint conditionnement_noms_type_check check (type in ('chef_zone', 'chef_ligne', 'ravitailleur'));
