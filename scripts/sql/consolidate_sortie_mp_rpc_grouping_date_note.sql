-- Consolide les trois evolutions recentes de stock_mp_record_sortie_batch,
-- qui ont chacune ete ecrites sans connaitre les autres (deux sessions en
-- parallele) et se seraient sinon ecrasees l'une l'autre :
--   1. note (deja en prod)
--   2. date_sortie choisie par l'utilisateur au lieu de current_date
--   3. regroupement par dossier (Doss ERP + Doss 4D) au sein d'un meme lot
--      de validation, au lieu d'un seul TS force pour tout le lot
-- Cette version remplace add_date_sortie_support_sortie_mp_rpc.sql ET
-- group_sortie_mp_par_dossier.sql - n'executer que celle-ci (la derniere
-- des trois executees ecrase les deux autres si on les colle a la suite).
create or replace function public.stock_mp_record_sortie_batch(p_lignes jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_ligne jsonb;
  v_lot_id bigint;
  v_quantite numeric;
  v_date_sortie date;
  v_article_id bigint;
  v_numero_lot text;
  v_code_normalise text;
  v_lot_key text;
  v_balance numeric;
  v_claimed numeric;
  v_available numeric;
  v_article_ids bigint[] := '{}';
  v_claimed_by_key jsonb := '{}'::jsonb;
  v_new_id bigint;
  v_new_ids bigint[] := '{}';
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
  -- les fonctions stock_* PF).
  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_lot_id := (v_ligne->>'lot_stock_id')::bigint;

    select article_id into v_article_id
    from public.lots_stock_matiere_premiere
    where id = v_lot_id;

    if v_article_id is null then
      raise exception 'Lot matiere premiere introuvable.';
    end if;

    if not (v_article_id = any(v_article_ids)) then
      v_article_ids := array_append(v_article_ids, v_article_id);
    end if;
  end loop;

  perform public._lock_articles_for_stock_mp(v_article_ids);

  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_lot_id := (v_ligne->>'lot_stock_id')::bigint;
    v_quantite := (v_ligne->>'quantite')::numeric;
    v_date_sortie := coalesce(nullif(v_ligne->>'date_sortie', '')::date, current_date);

    if v_lot_id is null or v_quantite is null or v_quantite <= 0 then
      raise exception 'Une sortie est incomplete ou invalide.';
    end if;

    select article_id, coalesce(nullif(numero_lot, ''), code_normalise), coalesce(nullif(code_normalise, ''), numero_lot)
    into v_article_id, v_numero_lot, v_code_normalise
    from public.lots_stock_matiere_premiere
    where id = v_lot_id;

    v_lot_key := v_article_id::text || '::' || upper(trim(v_code_normalise));

    select coalesce(sum(qte_entree - qte_sortie), 0)
    into v_balance
    from public.lots_stock_matiere_premiere
    where article_id = v_article_id
      and upper(trim(coalesce(nullif(code_normalise, ''), numero_lot))) = upper(trim(v_code_normalise));

    v_claimed := coalesce((v_claimed_by_key->>v_lot_key)::numeric, 0);
    v_available := greatest(0, v_balance - v_claimed);

    if v_quantite > v_available then
      raise exception 'Stock matiere premiere insuffisant pour le lot %. Disponible: %',
        coalesce(nullif(v_numero_lot, ''), v_code_normalise), v_available;
    end if;

    v_claimed_by_key := jsonb_set(v_claimed_by_key, array[v_lot_key], to_jsonb(v_claimed + v_quantite));

    insert into public.lots_stock_matiere_premiere (
      article_id, date_jour, numero_lot, code_normalise,
      qte_entree, qte_sortie, client, n_doss_erp, n_doss_4d, utilisateur,
      note, source_import
    ) values (
      v_article_id, v_date_sortie, v_numero_lot, upper(trim(v_code_normalise)),
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
