-- Nouvelle ligne libre en haut du Tableau de commande (au-dessus de
-- "Statut") : une note texte libre par commande, saisie directement dans
-- la case et sauvegardee automatiquement (pas de bouton "Enregistrer").
alter table public.commandes
  add column if not exists note_tableau_commande text;
