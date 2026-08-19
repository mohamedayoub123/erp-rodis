-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Garde qui a clique "Fin programme" (ou Valider Besoin) pour chaque
-- code/etape - jusqu'ici seule la date (termine_date) etait gardee, sans
-- savoir qui. Utilise par la nouvelle page "Historique Fin programme"
-- (colonne "Termine par") et pour toute autre section Salle de pesage/
-- Salle de conditionnement qui voudrait l'afficher plus tard.
--
-- Idempotent (peut etre relance sans risque) - nouvelle colonne nullable,
-- aucune donnee existante modifiee (les lignes deja terminees avant ce
-- changement resteront avec utilisateur = null, "?" a l'affichage).
alter table public.production_code_termine
  add column if not exists utilisateur text;
