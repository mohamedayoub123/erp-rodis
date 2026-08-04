-- "Programme par ligne" / Save devient tres lent (et peut carrement planter
-- - "An error occurred in the Server Components render...") a mesure que
-- programme_lignes grossit (6252+ lignes) : le calcul du prochain numero
-- MB<n> rapatriait TOUTE la table (colonne groupe_id) page par page rien
-- que pour compter les groupes distincts. Meme calcul, fait en base en une
-- seule requete.
create or replace function public.programme_lignes_next_group_number()
returns bigint
language sql
stable
as $$
  select count(distinct groupe_id) + 1 from public.programme_lignes;
$$;

revoke all on function public.programme_lignes_next_group_number() from public;
grant execute on function public.programme_lignes_next_group_number() to service_role;
