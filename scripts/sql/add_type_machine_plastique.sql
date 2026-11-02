-- Colonne "Type de machine" sur Statistique Article Plastique (E3) : remplie a la main par article,
-- dans une liste fixe (INJECTION, SOUFFLAGE ou PET). Sert ensuite a separer l'export Excel en 3 feuilles.
-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Idempotent (peut etre relance sans risque) - colonne nullable, aucune donnee existante modifiee.
alter table public.articles_matiere_premiere
  add column if not exists type_machine_plastique text;
