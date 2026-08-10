-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Salle de pesage/Salle de conditionnement doivent avoir leur PROPRE suivi
-- "termine", independant de Fabrication (stage "vrac") et Conditionnement
-- (stage "carton") - sinon Valider depuis Salle de pesage faisait aussi
-- disparaitre la ligne de Fabrication (meme stage "vrac" partage a tort).
alter table public.production_code_termine drop constraint if exists production_code_termine_stage_check;
alter table public.production_code_termine
  add constraint production_code_termine_stage_check
  check (stage in ('vrac', 'carton', 'emballage', 'pesage', 'salle_conditionnement'));
