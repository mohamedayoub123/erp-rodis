-- Compteur de numero par (Audit, Annee) pour NC Confidentiel - permet de
-- regler/redemarrer manuellement "le prochain numero" (ex: AI-1-2026-NC-034
-- -> prochain_numero = 34) sans devoir le retaper depuis des donnees
-- existantes a chaque fois. Reste une simple table de reglage : le champ
-- "numero" sur qualite_nc_confidentiel continue a etre saisi/corrige a la
-- main (felicite), ce compteur sert juste de reference/valeur de depart.
create table if not exists qualite_numero_compteurs (
  id bigint generated always as identity primary key,
  audit text not null,
  annee int not null,
  prochain_numero int not null default 1,
  updated_at timestamptz not null default now(),
  unique (audit, annee)
);
