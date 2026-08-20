-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- 1) Prix du kWh (meme table que Prix Gaz/Essence/Gasoil, saisi par mois
--    sur /charges/prix) - permet de calculer le cout electricite sur
--    Charges Usine, comme deja fait pour gaz/essence/gasoil.
-- 2) Consommation electrique (kW) sur une machine - fiche technique,
--    modifiable depuis la liste Machines.
--
-- Idempotent (peut etre relance sans risque) - colonnes nullable, aucune
-- donnee existante modifiee.
alter table public.prix_carburant
  add column if not exists prix_kwh numeric;

alter table public.machines
  add column if not exists consommation_electrique_kw numeric;
