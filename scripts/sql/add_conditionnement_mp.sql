-- Type de contenance des matieres premieres : Sac, Fut ou Barrique (la contenance elle-meme est en kg).
-- A coller dans Supabase Dashboard > SQL Editor (apres add_contenance_mp.sql).
--
-- Meme colonne a 3 endroits : l'article (type habituel), le lot recu (type reel) et la reception du dossier Import.
-- Valeurs enregistrees : SAC, FUT, BARRIQUE (la liste est dans lib/contenance-mp.ts, facile a completer).
alter table public.articles_matiere_premiere
  add column if not exists conditionnement text;

alter table public.lots_stock_matiere_premiere
  add column if not exists conditionnement text;

alter table public.bons_commande_mp_imports
  add column if not exists conditionnement text;
