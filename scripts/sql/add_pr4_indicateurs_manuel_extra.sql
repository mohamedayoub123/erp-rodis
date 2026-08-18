-- Ajoute les 4 indicateurs sans source automatique (heures supplementaires,
-- formation, reclamation produit non conforme, delai de livraison) comme
-- champs 100% manuels sur pr4_indicateurs_manuel - l'utilisateur les
-- saisit lui-meme depuis son fichier Excel, aucun calcul automatique pour
-- l'instant. A executer dans Supabase Dashboard > SQL Editor.
alter table public.pr4_indicateurs_manuel
  add column if not exists heures_supplementaires_pct numeric,
  add column if not exists formation_a_faire numeric,
  add column if not exists formation_realisee numeric,
  add column if not exists qt_retournee_nc numeric,
  add column if not exists qt_commande_livraison numeric,
  add column if not exists qt_livree_a_temps numeric;
