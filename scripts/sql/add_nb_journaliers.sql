-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute le nombre de journaliers (ouvriers payes a la journee) sur ce
-- poste, dans la section Equipe de Conditionnement et Emballage - 2
-- colonnes separees (comme le reste, une par etape) puisque
-- production_rapports partage la meme ligne entre Fabrication/
-- Conditionnement/Emballage pour un meme (programme_ligne_id, code).
alter table public.production_rapports
  add column if not exists nb_journaliers_conditionnement numeric,
  add column if not exists nb_journaliers_emballage numeric;

-- Emballage n'avait pas de "Chef de zone" (Conditionnement seul l'avait) -
-- colonne separee (emballage_chef_zone) pour ne pas ecraser celle de
-- Conditionnement, qui partage la meme ligne production_rapports pour ce
-- (programme_ligne_id, code).
alter table public.production_rapports
  add column if not exists emballage_chef_zone text;
