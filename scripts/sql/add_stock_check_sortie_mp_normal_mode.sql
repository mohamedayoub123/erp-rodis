-- Remplace stock_mp_record_sortie_batch (dernier remplacant :
-- allow_negative_stock_sortie_mp_free_article.sql) - ajoute 2 modes :
--   - normal (p_ligne.admin absent ou false) : bloque si le stock
--     disponible pour cet article+lot (somme qte_entree - qte_sortie) est
--     insuffisant pour couvrir la quantite demandee, comme avant la sortie
--     libre. Si l'article/lot n'existe pas du tout, disponible = 0.
--   - admin (p_ligne.admin = true) : aucune verification, comme aujourd'hui,
--     stock qui peut devenir negatif, numero de lot libre.
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
  v_admin boolean;
  v_disponible numeric;
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
  -- ensemble, toujours en ordre croissant (anti-deadlock) - le verrou reste
  -- necessaire meme en mode admin, contre deux sorties concurrentes.
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
    v_admin := coalesce((v_ligne->>'admin')::boolean, false);

    if v_article_id is null or v_numero_lot is null or v_quantite is null or v_quantite <= 0 then
      raise exception 'Une sortie est incomplete ou invalide.';
    end if;

    if not v_admin then
      select coalesce(sum(qte_entree), 0) - coalesce(sum(qte_sortie), 0)
        into v_disponible
        from public.lots_stock_matiere_premiere
        where article_id = v_article_id and code_normalise = v_code_normalise;

      if v_disponible < v_quantite then
        raise exception 'Stock insuffisant pour le lot % (disponible : %, demande : %). Utilisez Sortie admin pour forcer.', v_numero_lot, v_disponible, v_quantite;
      end if;
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
      case when v_admin then 'web:sortie-mp-admin' else 'web:sortie-mp' end
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
