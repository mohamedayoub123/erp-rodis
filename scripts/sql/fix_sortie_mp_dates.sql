-- La sortie MP ne recuperait jamais date_fabrication/date_expiration - ces
-- champs ne sont saisis qu'a l'entree, donc une sortie doit les reprendre du
-- lot existant (la ligne la plus recente qui les a reellement, generalement
-- l'entree - une sortie precedente sur le meme lot n'a jamais ces dates non
-- plus, donc "la plus recente qui les a" evite de propager un null).
create or replace function public.stock_mp_record_sortie_batch(p_lignes jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_ligne jsonb;
  v_lot_id bigint;
  v_quantite numeric;
  v_article_id bigint;
  v_numero_lot text;
  v_code_normalise text;
  v_date_fabrication date;
  v_date_expiration date;
  v_lot_key text;
  v_balance numeric;
  v_claimed numeric;
  v_available numeric;
  v_article_ids bigint[] := '{}';
  v_claimed_by_key jsonb := '{}'::jsonb;
  v_new_id bigint;
  v_new_ids bigint[] := '{}';
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

    select date_fabrication, date_expiration
    into v_date_fabrication, v_date_expiration
    from public.lots_stock_matiere_premiere
    where article_id = v_article_id
      and upper(trim(coalesce(nullif(code_normalise, ''), numero_lot))) = upper(trim(v_code_normalise))
      and (date_fabrication is not null or date_expiration is not null)
    order by date_jour desc, id desc
    limit 1;

    insert into public.lots_stock_matiere_premiere (
      article_id, date_jour, numero_lot, code_normalise,
      date_fabrication, date_expiration,
      qte_entree, qte_sortie, client, n_doss_erp, n_doss_4d, utilisateur,
      source_import
    ) values (
      v_article_id, current_date, v_numero_lot, upper(trim(v_code_normalise)),
      v_date_fabrication, v_date_expiration,
      0, v_quantite,
      nullif(v_ligne->>'client', ''),
      nullif(v_ligne->>'n_doss_erp', ''),
      nullif(v_ligne->>'n_doss_4d', ''),
      nullif(v_ligne->>'utilisateur', ''),
      'web:sortie-mp'
    )
    returning id into v_new_id;

    v_new_ids := array_append(v_new_ids, v_new_id);
  end loop;

  select min(x) into v_group_id from unnest(v_new_ids) x;

  update public.lots_stock_matiere_premiere
  set mouvement_groupe_id = v_group_id
  where id = any(v_new_ids);

  return jsonb_build_object('groupe_id', v_group_id, 'lignes', array_length(v_new_ids, 1));
end;
$$;

revoke all on function public.stock_mp_record_sortie_batch(jsonb) from public;
grant execute on function public.stock_mp_record_sortie_batch(jsonb) to service_role;
