-- Nouvelle ligne "Remarque" dans le Tableau de commande, juste avant la ligne
-- "Date commande" : une remarque texte libre par commande (colonne), saisie
-- directement dans la case et sauvegardee automatiquement (comme la ligne
-- "Note" du haut, voir add_commandes_note_tableau.sql). Tant que ce script
-- n'est pas execute, la ligne Remarque n'apparait pas et le Tableau de
-- commande marche exactement comme avant.
alter table public.commandes
  add column if not exists remarque_tableau_commande text;
