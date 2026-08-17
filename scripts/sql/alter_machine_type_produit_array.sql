-- Permet plusieurs types de produit par machine (au lieu d'un seul) -
-- convertit la valeur unique deja saisie en tableau a 1 element, rien n'est
-- perdu. A executer dans Supabase Dashboard > SQL Editor.
alter table public.machines
  alter column type_produit type text[]
  using case when type_produit is null or type_produit = '' then null else array[type_produit] end;
