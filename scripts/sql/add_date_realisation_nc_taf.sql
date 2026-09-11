-- Date de realisation (cloture) auto-remplie par le code des qu'un NC/TAF
-- passe a CLOTUREE - jamais tapee a la main. La date de creation existe
-- deja (colonne created_at), seule celle-ci manquait.
alter table qualite_nc_confidentiel
  add column if not exists date_realisation date;

alter table qualite_taf_confidentiel
  add column if not exists date_realisation date;

-- Backfill : pour les lignes deja cloturees, prend updated_at comme
-- meilleure estimation disponible de la date de cloture reelle (aucune
-- trace plus precise n'existe pour les cloture passees).
update qualite_nc_confidentiel
set date_realisation = updated_at::date
where statut_cloture = 'CLOTUREE' and date_realisation is null;

update qualite_taf_confidentiel
set date_realisation = updated_at::date
where statut = 'CLOTUREE' and date_realisation is null;
