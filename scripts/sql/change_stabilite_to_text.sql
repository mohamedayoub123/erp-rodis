-- La stabilite etait un champ numerique, mais en pratique c'est un choix
-- binaire (Stable / Non stable) fait dans le formulaire - passage en texte
-- pour stocker directement ce choix au lieu d'un chiffre.
-- Les anciennes valeurs numeriques existantes sont converties en texte tel
-- quel (ex: 12.5 -> "12.5") - elles restent visibles dans l'historique mais
-- ne correspondent plus a une saisie "Stable"/"Non stable".
alter table public.production_rapports
  alter column stabilite type text using stabilite::text;
