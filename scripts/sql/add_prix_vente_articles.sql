-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Prix de vente standard (fixe) par article produit fini - saisi depuis
-- Comptabilite > Prix de vente, a cote du prix de revient deja calcule -
-- prerequis pour generer plus tard les ecritures Client/Ventes (Phase 2,
-- pas encore fait).
alter table public.articles
  add column if not exists prix_vente numeric;
