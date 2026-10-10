-- Contenance des matieres premieres (sac de 25 kg, fut de 200 L...). A coller dans Supabase Dashboard > SQL Editor.
--
-- 1) articles_matiere_premiere.contenance : la contenance habituelle de l'article (proposee a la reception).
-- 2) lots_stock_matiere_premiere.contenance : la contenance REELLE de chaque lot recu (un meme article peut arriver
--    avec une contenance differente d'un lot a l'autre).
-- 3) bons_commande_mp_imports.contenance : la meme valeur, gardee sur la reception du dossier Import.
-- Le nombre est dans l'unite de l'article (25 pour un sac de 25 kg).
alter table public.articles_matiere_premiere
  add column if not exists contenance numeric check (contenance is null or contenance > 0);

alter table public.lots_stock_matiere_premiere
  add column if not exists contenance numeric check (contenance is null or contenance > 0);

alter table public.bons_commande_mp_imports
  add column if not exists contenance numeric check (contenance is null or contenance > 0);
