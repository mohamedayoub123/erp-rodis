-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- production_mp_reserve.quantite va devenir le "reste encore reserve" (deja
-- diminue au fur et a mesure de la vraie production) - il faut garder la
-- quantite D'ORIGINE quelque part pour calculer le ratio produit/prevu a
-- chaque nouvelle saisie. Nouvelle colonne, remplie avec la valeur actuelle
-- de "quantite" pour les lignes deja existantes (rien n'a encore ete
-- consomme dessus). Sans danger a relancer plusieurs fois.
alter table public.production_mp_reserve add column if not exists quantite_initiale numeric;
update public.production_mp_reserve set quantite_initiale = quantite where quantite_initiale is null;
alter table public.production_mp_reserve alter column quantite_initiale set not null;
