-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute le prix de 1h de journalier a la page Tarifs (ex "Prix Carburant",
-- table prix_carburant - meme table, le nom en base n'a pas ete change,
-- seul l'affichage a l'ecran l'a ete).
--
-- Idempotent (peut etre relance sans risque) - colonne nullable, aucune
-- donnee existante modifiee.
alter table public.prix_carburant
  add column if not exists prix_heure_journalier numeric;
