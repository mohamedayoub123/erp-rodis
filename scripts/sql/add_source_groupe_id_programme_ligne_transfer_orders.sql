-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Meme role que source_numero_programme (deja utilise par Programme MB)
-- mais pour Programme par ligne : relie un Transfer Order cree depuis
-- "Verifier stock" (Programme par ligne) au groupe programme_lignes
-- d'origine (programme_lignes.groupe_id), pour savoir plus tard si ce
-- programme est deja entierement couvert par des Transfer Order existants.
--
-- Idempotent (peut etre relance sans risque) - colonne nullable, aucune
-- donnee existante modifiee.
alter table public.transfer_orders
  add column if not exists source_groupe_id_programme_ligne integer;
