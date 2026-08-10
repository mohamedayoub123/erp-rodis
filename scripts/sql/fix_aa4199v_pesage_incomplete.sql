-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
-- Le code AA4199V (ligne 9, stage pesage) a ete marque "termine" au moment
-- ou la validation a plante (colonne numero_lot manquante sur
-- production_mp_reserve, corrigee depuis) - aucune reservation MP n'a ete
-- creee, mais le code a disparu de la liste "Salle de pesage" du Dashboard
-- puisqu'il est deja marque termine. Supprime cette ligne pour qu'il
-- reapparaisse et puisse etre valide normalement, proprement cette fois.
delete from public.production_code_termine
where programme_ligne_id = 9 and code = 'AA4199V' and stage = 'pesage';

-- Verification (doit renvoyer 0 ligne)
select * from public.production_code_termine
where programme_ligne_id = 9 and code = 'AA4199V' and stage = 'pesage';
