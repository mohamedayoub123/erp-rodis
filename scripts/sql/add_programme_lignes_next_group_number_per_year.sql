-- Remplace programme_lignes_next_group_number_rpc.sql : le code affiche
-- passe de MB<n> (numero global, jamais remis a zero) a PL<n>.<annee> (ex:
-- PL1.2026), avec le numero qui repart a 1 a chaque nouvelle annee - il
-- faut donc compter les groupes distincts filtres sur l'annee de date_jour,
-- pas sur toute la table.
create or replace function public.programme_lignes_next_group_number_for_year(p_year int)
returns bigint
language sql
stable
as $$
  select count(distinct groupe_id) + 1
  from public.programme_lignes
  where extract(year from date_jour) = p_year;
$$;

revoke all on function public.programme_lignes_next_group_number_for_year(int) from public;
grant execute on function public.programme_lignes_next_group_number_for_year(int) to service_role;
