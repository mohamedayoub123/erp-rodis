-- "Suivi Production" affiche deja qui a saisi chaque etape (utilisateur_fabrication/
-- utilisateur_conditionnement/utilisateur_emballage, deja en base) mais pas QUAND -
-- ajoute un timestamp par etape, rempli en meme temps que l'utilisateur a chaque
-- Save (saveFabricationRapportAction/updateConditionnementRapportAction/
-- saveEmballageRapportAction). Les rapports deja saisis avant cette colonne
-- restent a NULL (pas de moyen fiable de retrouver retroactivement quand).
alter table public.production_rapports
  add column if not exists date_saisie_fabrication timestamptz,
  add column if not exists date_saisie_conditionnement timestamptz,
  add column if not exists date_saisie_emballage timestamptz;
