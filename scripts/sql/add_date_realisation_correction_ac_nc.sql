-- Complement a add_date_realisation_nc_taf.sql - NC Confidentiel a en
-- realite 2 etapes distinctes qui peuvent chacune etre "realisee" a des
-- dates differentes (Correction, puis Action Corrective/AC), avant que la
-- cloture globale (les 2 faites) n'intervienne. Chacune merite sa propre
-- date, jamais tapee a la main - meme principe que date_realisation.
alter table qualite_nc_confidentiel
  add column if not exists date_realisation_correction date;

alter table qualite_nc_confidentiel
  add column if not exists date_realisation_ac date;

-- Backfill : pour les lignes deja REALISEE, prend updated_at comme
-- meilleure estimation disponible (aucune trace plus precise n'existe pour
-- le passe).
update qualite_nc_confidentiel
set date_realisation_correction = updated_at::date
where statut_correction = 'REALISEE' and date_realisation_correction is null;

update qualite_nc_confidentiel
set date_realisation_ac = updated_at::date
where statut_ac = 'REALISEE' and date_realisation_ac is null;
