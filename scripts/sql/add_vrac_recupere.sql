-- Vrac recupere (reintegre depuis un reste/dechet d'un batch precedent) -
-- quantite et code du lot d'origine, saisis sur le rapport Fabrication.
alter table public.production_rapports
  add column if not exists qt_vrac_recupere numeric,
  add column if not exists code_vrac_recupere text;
