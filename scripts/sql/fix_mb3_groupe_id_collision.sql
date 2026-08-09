-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- 1) Reapplique la version correcte de programme_lignes_bulk_update_numero_lot
--    (avec numero_lot_detail) - constate que numero_lot etait bien ecrit mais
--    pas numero_lot_detail sur V2, symptome d'une version plus ancienne de
--    cette fonction encore active malgre le sync du 2026-08-07.
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

-- 2) Repare MB3/PD7 : ses 2 lignes miroir (id 4 et 5) avaient recu
--    groupe_id=4 par coincidence avec une ligne migree depuis V1 totalement
--    sans rapport (id 85, "CREME WHITE SECRET 140 ML") qui utilisait deja
--    ce groupe_id - les 2 programmes etaient donc lies par erreur (confirmer
--    l'un aurait aussi confirme/deconfirme l'autre). Leur deplace vers un
--    groupe_id neuf, jamais utilise, et backfill numero_lot_detail (perdu
--    par le bug du point 1 lors du premier Dispatch) a partir des lots reels
--    deja visibles dans l'historique PD7.
do $$
declare
  v_new_groupe_id bigint;
begin
  select coalesce(max(groupe_id), 0) + 1 into v_new_groupe_id from public.programme_lignes;

  update public.programme_lignes
  set groupe_id = v_new_groupe_id
  where id in (4, 5);

  update public.programme_lignes
  set numero_lot_detail = '[{"code":"AA4187V","qt_vrac":3000,"qt_carton":312.5},{"code":"AA4188V","qt_vrac":3000,"qt_carton":312.5}]'::jsonb
  where id = 4;

  update public.programme_lignes
  set numero_lot_detail = '[{"code":"AA4189V","qt_vrac":3000,"qt_carton":312.5},{"code":"AA4190V","qt_vrac":3000,"qt_carton":312.5}]'::jsonb
  where id = 5;

  update public.programme_dispatcher_history
  set source_groupe_id = v_new_groupe_id
  where id in (10, 11, 12, 13);
end $$;
