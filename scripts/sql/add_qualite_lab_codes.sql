-- Nouveau module Qualite > Lab : meme principe que Code par article
-- (Production) mais completement independant - ses propres colonnes,
-- jamais lues/ecrites par Code par article ni par Ravitailleur par ligne.
alter table public.articles
  add column if not exists lab_code_auto text,
  add column if not exists lab_code_manu text;
