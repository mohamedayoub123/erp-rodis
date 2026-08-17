-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET V1/PRODUCTION.
--
-- Porte vers V1 le meme changement de schema que V2 pour Salle de pesage/
-- Salle de conditionnement (Dashboard Production) :
--
-- 1) production_code_termine.stage : Salle de pesage/Salle de
--    conditionnement doivent avoir leur PROPRE suivi "termine", independant
--    de Fabrication (stage "vrac") et Conditionnement (stage "carton") -
--    sinon Valider depuis Salle de pesage ferait aussi disparaitre la ligne
--    de Fabrication (meme stage "vrac" partage a tort).
--
-- 2) production_code_termine.numero_lot : numero de lot reel (attribue au
--    moment du "Valider" depuis Salle de pesage/Salle de conditionnement)
--    pour chaque code termine, vrac et conditionnement separement (une
--    ligne par (programme_ligne_id, code, stage) existe deja dans cette
--    table). Colonne absente sur V1 jusqu'ici (verifie : ni
--    create_production_code_termine.sql, ni le port V2->V1 ne l'ajoutaient).
--
-- Idempotent (peut etre relance sans risque) - aucune donnee existante
-- n'est modifiee, la nouvelle colonne est nullable.
alter table public.production_code_termine
  add column if not exists numero_lot text;

alter table public.production_code_termine drop constraint if exists production_code_termine_stage_check;
alter table public.production_code_termine
  add constraint production_code_termine_stage_check
  check (stage in ('vrac', 'carton', 'emballage', 'pesage', 'salle_conditionnement'));
