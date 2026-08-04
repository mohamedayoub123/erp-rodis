-- Remplace stock_mp_record_sortie_batch (dernier remplacant :
-- consolidate_sortie_mp_rpc_grouping_date_note.sql) - deux changements a la
-- demande de l'utilisateur :
--   1. Prend article_id + numero_lot directement (au lieu de lot_stock_id)
--      pour pouvoir sortir un article qui n'a JAMAIS eu d'entree du tout,
--      pas seulement un lot deja existant.
--   2. Retire le blocage "stock insuffisant" - le stock peut partir en
--      negatif, saisie manuelle assumee par l'utilisateur.
create or replace function public.stock_mp_record_sortie_batch(p_lignes jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_ligne jsonb;
  v_article_id bigint;
  v_numero_lot text;
  v_code_normalise text;
  v_quantite numeric;
  v_date_sortie date;
  v_new_id bigint;
  v_new_ids bigint[] := '{}';
  v_article_ids bigint[] := '{}';
  v_dossier_key text;
  v_ids_by_dossier jsonb := '{}'::jsonb;
  v_ids_for_key bigint[];
  v_group_ids bigint[] := '{}';
  v_group_id bigint;
begin
  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucune sortie a approuver.';
  end if;

  -- Premiere passe : collecter tous les articles touches pour les verrouiller
  -- ensemble, toujours en ordre croissant (meme discipline anti-deadlock que
  -- les fonctions stock_* PF), meme si le blocage stock insuffisant a
  -- disparu - le verrou reste utile contre deux sorties concurrentes qui
  -- ecriraient en meme temps.
  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_article_id := (v_ligne->>'article_id')::bigint;

    if v_article_id is null then
      raise exception 'Article invalide.';
    end if;

    if not (v_article_id = any(v_article_ids)) then
      v_article_ids := array_append(v_article_ids, v_article_id);
    end if;
  end loop;

  perform public._lock_articles_for_stock_mp(v_article_ids);

  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_article_id := (v_ligne->>'article_id')::bigint;
    v_numero_lot := nullif(v_ligne->>'numero_lot', '');
    v_code_normalise := coalesce(nullif(v_ligne->>'code_normalise', ''), upper(trim(coalesce(v_numero_lot, ''))));
    v_quantite := (v_ligne->>'quantite')::numeric;
    v_date_sortie := coalesce(nullif(v_ligne->>'date_sortie', '')::date, current_date);

    if v_article_id is null or v_numero_lot is null or v_quantite is null or v_quantite <= 0 then
      raise exception 'Une sortie est incomplete ou invalide.';
    end if;

    insert into public.lots_stock_matiere_premiere (
      article_id, date_jour, numero_lot, code_normalise,
      qte_entree, qte_sortie, client, n_doss_erp, n_doss_4d, utilisateur,
      note, source_import
    ) values (
      v_article_id, v_date_sortie, v_numero_lot, v_code_normalise,
      0, v_quantite,
      nullif(v_ligne->>'client', ''),
      nullif(v_ligne->>'n_doss_erp', ''),
      nullif(v_ligne->>'n_doss_4d', ''),
      nullif(v_ligne->>'utilisateur', ''),
      nullif(v_ligne->>'note', ''),
      'web:sortie-mp'
    )
    returning id into v_new_id;

    v_new_ids := array_append(v_new_ids, v_new_id);

    v_dossier_key := coalesce(nullif(v_ligne->>'n_doss_erp', ''), '') || '|||' || coalesce(nullif(v_ligne->>'n_doss_4d', ''), '');
    v_ids_for_key := array(
      select jsonb_array_elements_text(coalesce(v_ids_by_dossier->v_dossier_key, '[]'::jsonb))::bigint
    );
    v_ids_for_key := array_append(v_ids_for_key, v_new_id);
    v_ids_by_dossier := jsonb_set(v_ids_by_dossier, array[v_dossier_key], to_jsonb(v_ids_for_key));
  end loop;

  for v_dossier_key in select jsonb_object_keys(v_ids_by_dossier)
  loop
    v_ids_for_key := array(
      select jsonb_array_elements_text(v_ids_by_dossier->v_dossier_key)::bigint
    );
    select min(x) into v_group_id from unnest(v_ids_for_key) x;

    update public.lots_stock_matiere_premiere
    set mouvement_groupe_id = v_group_id
    where id = any(v_ids_for_key);

    v_group_ids := array_append(v_group_ids, v_group_id);
  end loop;

  return jsonb_build_object('groupes', v_group_ids, 'lignes', array_length(v_new_ids, 1));
end;
$$;

revoke all on function public.stock_mp_record_sortie_batch(jsonb) from public;
grant execute on function public.stock_mp_record_sortie_batch(jsonb) to service_role;
