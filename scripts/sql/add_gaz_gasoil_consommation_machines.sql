-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Certaines machines Energie (groupe electrogene...) ne consomment pas QUE
-- de l'electricite - certaines tournent au gaz, d'autres au gasoil, en plus
-- ou a la place du kW electrique. Ajoute 2 champs de consommation par
-- heure, dans la meme unite que prix_carburant.prix_gaz/prix_gasoil (deja
-- utilises par Charges Usine) - voir lib/cout-production-reel.ts pour le
-- calcul de cout qui les utilise.
--
-- Idempotent (peut etre relance sans risque) - colonnes nullable, aucune
-- donnee existante modifiee.
alter table public.machines
  add column if not exists consommation_gaz_litres_heure numeric,
  add column if not exists consommation_gasoil_litres_heure numeric;
