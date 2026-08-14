-- Numero interne auto-genere par declaration d'import (IM.<annee>.<sequence>),
-- attribue a chaque "Creer import" - distinct des Doss. 4D/ERP (references
-- externes reelles saisies a la main).
alter table public.bons_commande_mp_imports
add column if not exists numero_import text;
