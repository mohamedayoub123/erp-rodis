-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Nouveau compte pour les pertes de matiere premiere (Sortie MP jamais liee
-- a une production, ou correction de stock cochee "C'est une perte") -
-- structure SYSCOHADA (classe 6, charges).
insert into public.comptes_comptables (code, libelle, classe)
values ('658000', 'Pertes sur stock de matieres premieres', 6)
on conflict (code) do nothing;
