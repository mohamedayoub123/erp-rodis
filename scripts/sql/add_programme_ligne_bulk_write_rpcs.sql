-- Le Save de "Programme par ligne" (et "Relancer" depuis Historique
-- programme) restait lent - voire plantait avec une erreur serveur/reseau -
-- sur les gros programmes (beaucoup de chaines/articles) : meme limitees a
-- 5 a la fois, les ecritures groupees (suppression dispatcher par zone/
-- chaine, mise a jour numero_lot par ligne, mise a jour code par article)
-- faisaient encore plusieurs vagues d'allers-retours reseau sequentielles,
-- assez pour depasser le temps limite de la fonction serverless sur un gros
-- relance. Ces 3 RPC font chacune tout leur travail en UNE seule requete
-- (boucle cote base, pas cote reseau).
create or replace function public.programme_dispatcher_clear_zones(p_pairs jsonb)
returns void
language plpgsql
as $$
declare
  v_pair jsonb;
begin
  for v_pair in select * from jsonb_array_elements(p_pairs)
  loop
    delete from public.programme_dispatcher_lignes
    where zone = (v_pair->>'zone')
      and chaine = (v_pair->>'chaine');
  end loop;
end;
$$;

create or replace function public.programme_lignes_bulk_update_numero_lot(p_updates jsonb)
returns void
language plpgsql
as $$
declare
  v_update jsonb;
begin
  for v_update in select * from jsonb_array_elements(p_updates)
  loop
    update public.programme_lignes
    set numero_lot = (v_update->>'numero_lot')
    where id = (v_update->>'id')::bigint;
  end loop;
end;
$$;

create or replace function public.articles_bulk_update_codes(p_updates jsonb)
returns void
language plpgsql
as $$
declare
  v_update jsonb;
begin
  for v_update in select * from jsonb_array_elements(p_updates)
  loop
    update public.articles
    set
      code_manu = coalesce(v_update->>'code_manu', code_manu),
      code_auto = coalesce(v_update->>'code_auto', code_auto)
    where id = (v_update->>'id')::bigint;
  end loop;
end;
$$;

revoke all on function public.programme_dispatcher_clear_zones(jsonb) from public;
revoke all on function public.programme_lignes_bulk_update_numero_lot(jsonb) from public;
revoke all on function public.articles_bulk_update_codes(jsonb) from public;
grant execute on function public.programme_dispatcher_clear_zones(jsonb) to service_role;
grant execute on function public.programme_lignes_bulk_update_numero_lot(jsonb) to service_role;
grant execute on function public.articles_bulk_update_codes(jsonb) to service_role;
