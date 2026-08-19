-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Redepose stock_mp_record_sortie_batch (remplace la version live de
-- add_stock_check_sortie_mp_normal_mode.sql, meme logique de verrouillage/
-- mode normal-admin/regroupement dossier, RIEN retire) en ajoutant la
-- recuperation de date_fabrication/date_expiration, perdue en route -
-- deja corrigee une fois par fix_sortie_mp_dates.sql (2026-08-03), mais
-- chaque reecriture complete de cette fonction depuis (ajout du mode
-- normal/admin notamment) recreait le corps SANS reprendre cette partie,
-- donc la correction a disparu sans que personne ne la retire exprès.
--
-- Ces champs ne sont saisis qu'a l'entree - une sortie doit les reprendre
-- du lot existant (la ligne la plus recente qui les a reellement, pour
-- eviter de propager un null si une sortie precedente sur le meme lot
-- n'a jamais eu ces dates non plus).
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
  v_date_fabrication date;
  v_date_expiration date;
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

    select date_fabrication, date_expiration
    into v_date_fabrication, v_date_expiration
    from public.lots_stock_matiere_premiere
    where article_id = v_article_id
      and code_normalise = v_code_normalise
      and (date_fabrication is not null or date_expiration is not null)
    order by date_jour desc, id desc
    limit 1;

    insert into public.lots_stock_matiere_premiere (
      article_id, date_jour, numero_lot, code_normalise,
      date_fabrication, date_expiration,
      qte_entree, qte_sortie, client, n_doss_erp, n_doss_4d, utilisateur,
      note, source_import
    ) values (
      v_article_id, v_date_sortie, v_numero_lot, v_code_normalise,
      v_date_fabrication, v_date_expiration,
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

-- Rattrapage des sorties DEJA enregistrees pendant que le bug etait actif
-- (2273 lignes constatees) - remplit date_fabrication/date_expiration sur
-- chaque sortie qui n'en a aucune, en reprenant la ligne la plus recente
-- du meme article+lot qui, elle, en a une. Ne touche jamais une ligne
-- d'entree (deja correcte) ni une sortie qui a deja une date.
update public.lots_stock_matiere_premiere s
set date_fabrication = src.date_fabrication,
    date_expiration = src.date_expiration
from lateral (
  select date_fabrication, date_expiration
  from public.lots_stock_matiere_premiere src
  where src.article_id = s.article_id
    and src.code_normalise = s.code_normalise
    and (src.date_fabrication is not null or src.date_expiration is not null)
  order by src.date_jour desc, src.id desc
  limit 1
) src
where s.source_import in ('web:sortie-mp', 'web:sortie-mp-admin')
  and s.date_fabrication is null
  and s.date_expiration is null;
