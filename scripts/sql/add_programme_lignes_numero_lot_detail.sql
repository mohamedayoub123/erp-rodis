-- Le Dashboard Production (splitLigneIntoDisplayRows) reconstituait la
-- repartition qt_vrac/qt_carton par code d'une ligne multi-lots ("AB1044,
-- AB1046") en allant chercher les lots correspondants dans
-- programme_dispatcher_lignes - mais cette table est un instantane de la
-- production EN COURS, videe et reecrite a chaque nouveau Save touchant la
-- meme (zone, chaine), meme pour une toute autre ligne/date. Des qu'un
-- Save ulterieur touchait la meme chaine, l'ancienne ligne perdait sa
-- repartition par lot et retombait sur l'affichage combine "AB1044,
-- AB1046" au lieu d'une ligne par code. Cette colonne fige la repartition
-- au moment du Save (jamais modifiee ensuite), independamment de ce que
-- devient le Dispatcher.
alter table public.programme_lignes
  add column if not exists numero_lot_detail jsonb;

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
    set numero_lot = (v_update->>'numero_lot'),
        numero_lot_detail = (v_update->'numero_lot_detail')
    where id = (v_update->>'id')::bigint;
  end loop;
end;
$$;

revoke all on function public.programme_lignes_bulk_update_numero_lot(jsonb) from public;
grant execute on function public.programme_lignes_bulk_update_numero_lot(jsonb) to service_role;
