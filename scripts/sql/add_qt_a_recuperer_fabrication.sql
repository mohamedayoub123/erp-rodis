-- Nouveau champ "Qt a recuperer" sur la fiche Fabrication : une partie du
-- vrac fabrique (parmi les 4 cuves) que l'utilisateur met de cote au lieu
-- d'envoyer au Conditionnement - cette quantite devient un vrai lot de
-- stock vrac dans Depot B (numero_lot = code de la ligne), recuperable plus
-- tard via les champs deja existants "Qt vrac recupere"/"Code vrac
-- recupere" sur une fabrication ulterieure.
alter table public.production_rapports
  add column if not exists qt_a_recuperer numeric;
