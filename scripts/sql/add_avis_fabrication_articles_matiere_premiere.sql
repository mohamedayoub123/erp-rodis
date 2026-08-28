-- Colonne "Avis de fabrication" sur Statistique Article Plastique (E3) -
-- note libre remplie a la main par article (a cote de "A fabriquer", qui
-- reste calcule automatiquement), demande explicite.
alter table public.articles_matiere_premiere
  add column if not exists avis_fabrication text;
