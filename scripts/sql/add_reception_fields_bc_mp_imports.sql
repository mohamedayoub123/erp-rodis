-- Champs de reception (numero de lot, dates) captures depuis le bouton
-- "Reception" sur le detail d'un dossier Import MP - optionnels car les
-- evenements d'import crees depuis le BC (avant ce changement) n'en ont pas.
alter table public.bons_commande_mp_imports
  add column if not exists numero_lot text,
  add column if not exists date_fabrication date,
  add column if not exists date_expiration date;
