-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Ajoute le dechet "Etui" a Conditionnement, comme Sleeve/Capsule/Pompe/
-- Flacon/Pot/Etiquette deja suivis (articles.besoin_etui existe deja pour
-- indiquer qu'un article a besoin d'etui, mais rien ne suivait son dechet).
alter table public.production_rapports
  add column if not exists dechet_etui numeric;
