-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Ajoute la tracabilite "saisi par" sur les rapports Production (fabrication,
-- conditionnement, emballage), meme principe que lots_stock.utilisateur.

-- Fabrication/Conditionnement/Emballage partagent la meme ligne
-- production_rapports (upsert sur programme_ligne_id) mais sont remplis par
-- des personnes differentes a des moments differents - une seule colonne
-- "utilisateur" serait ecrasee a chaque section enregistree. Une colonne par
-- section garde la tracabilite de chacune independamment.
alter table public.production_rapports add column if not exists utilisateur_fabrication text;
alter table public.production_rapports add column if not exists utilisateur_conditionnement text;
alter table public.production_rapports add column if not exists utilisateur_emballage text;
