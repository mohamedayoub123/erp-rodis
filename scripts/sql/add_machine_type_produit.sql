-- Ajoute un champ "type de produit" sur les machines (gel douche, huile,
-- savon...), distinct du champ "type" existant (Fabrication/Conditionnement/
-- Emballage, qui decrit l'ETAPE, pas le produit) - pour voir d'un coup
-- d'oeil ce que fabrique chaque machine.
-- A executer dans Supabase Dashboard > SQL Editor.
alter table public.machines add column if not exists type_produit text;
