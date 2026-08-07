-- "Date fabrication"/"Date conditionnement"/"Date emballage" affichees dans
-- Suivi Production venaient jusqu'ici de la date AUTOMATIQUE (today, valeur
-- par defaut) de production_vrac_entries/production_carton_entries/
-- production_emballage_entries.date_jour, jamais choisie a la main.
-- date_fabrication_conditionnement existe deja (utilisee par le rapport
-- Conditionnement) et sera desormais aussi saisie sur le rapport
-- Fabrication (meme champ, partage entre les 2 comme son nom l'indique) -
-- cette colonne ajoute l'equivalent pour Emballage, qui n'en avait aucune.
alter table public.production_rapports
  add column if not exists date_emballage date;
