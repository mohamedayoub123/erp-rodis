-- Suivi de reception/import par article : quantite deja importee (saisie
-- manuellement au fur et a mesure) et ses propres references dossier,
-- distinctes du dossier de la commande initiale (n_doss_4d/n_doss_erp).
-- Le statut n'est plus stocke/modifie a la main : il se calcule depuis
-- quantite vs quantite_importee (voir code applicatif).
alter table public.bons_commande_matiere_premiere
  add column if not exists quantite_importee numeric not null default 0,
  add column if not exists n_doss_4d_import text,
  add column if not exists n_doss_erp_import text;
