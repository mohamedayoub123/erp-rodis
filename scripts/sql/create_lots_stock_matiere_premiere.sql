-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Mouvements Matiere Premiere : meme principe que lots_stock (grand livre
-- append-only, cf. scripts/sql/mouvements_groupage.sql et
-- stock_locking_functions.sql) mais dans sa propre table, car
-- articles_matiere_premiere est un catalogue distinct de articles (PF).
-- Ne touche a rien cote articles_matiere_premiere.

create table if not exists public.lots_stock_matiere_premiere (
  id bigserial primary key,
  article_id bigint not null references public.articles_matiere_premiere(id),
  numero_lot text,
  code_normalise text,
  date_reception date,
  date_fabrication date,
  date_expiration date,
  date_jour date not null default current_date,
  qte_entree numeric not null default 0,
  qte_sortie numeric not null default 0,
  unite text,
  fournisseur text,
  client text,
  n_doss_erp text,
  n_doss_4d text,
  emplacement text,
  utilisateur text,
  note text,
  source_import text,
  mouvement_groupe_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_lots_stock_mp_article on public.lots_stock_matiere_premiere (article_id);
create index if not exists idx_lots_stock_mp_groupe on public.lots_stock_matiere_premiere (mouvement_groupe_id);
create index if not exists idx_lots_stock_mp_source on public.lots_stock_matiere_premiere (source_import);

-- Verrouillage advisory dans un namespace distinct de _lock_articles_for_stock
-- (778001001, utilise par lots_stock/PF) pour qu'un mouvement MP ne bloque
-- jamais inutilement un mouvement PF meme si les deux id d'article se
-- recoupent numeriquement (deux catalogues d'articles distincts).
create or replace function public._lock_articles_for_stock_mp(p_article_ids bigint[])
returns void
language plpgsql
as $$
declare
  v_id bigint;
begin
  for v_id in
    select distinct x from unnest(p_article_ids) as x where x is not null order by x
  loop
    perform pg_advisory_xact_lock(778001002, v_id::int);
  end loop;
end;
$$;

revoke all on function public._lock_articles_for_stock_mp(bigint[]) from public;

-- Supprime une seule ligne (utilise par les pages de detail entree/sortie MP).
-- Pas de fifo_resultats pour la matiere premiere, donc pas de garde-fou
-- equivalent a stock_delete_lot (PF) a verifier ici.
create or replace function public.stock_mp_delete_lot(p_lot_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_article_id bigint;
begin
  select article_id into v_article_id
  from public.lots_stock_matiere_premiere
  where id = p_lot_id;

  if v_article_id is null then
    raise exception 'Ligne stock matiere premiere invalide.';
  end if;

  perform public._lock_articles_for_stock_mp(array[v_article_id]);
  perform 1 from public.lots_stock_matiere_premiere where id = p_lot_id for update;

  delete from public.lots_stock_matiere_premiere where id = p_lot_id;

  return jsonb_build_object('lot_id', p_lot_id, 'deleted', true);
end;
$$;

revoke all on function public.stock_mp_delete_lot(bigint) from public;
grant execute on function public.stock_mp_delete_lot(bigint) to service_role;

-- Supprime tout un mouvement TE/TS (toutes les lignes qui partagent le meme
-- mouvement_groupe_id), meme principe que stock_delete_lot_group (PF).
create or replace function public.stock_mp_delete_lot_group(p_groupe_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_article_ids bigint[];
  v_deleted_count int;
begin
  select array_agg(distinct article_id) into v_article_ids
  from public.lots_stock_matiere_premiere
  where mouvement_groupe_id = p_groupe_id;

  if v_article_ids is null or array_length(v_article_ids, 1) is null then
    raise exception 'Mouvement introuvable.';
  end if;

  perform public._lock_articles_for_stock_mp(v_article_ids);
  perform 1 from public.lots_stock_matiere_premiere where mouvement_groupe_id = p_groupe_id for update;

  delete from public.lots_stock_matiere_premiere where mouvement_groupe_id = p_groupe_id;
  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object('groupe_id', p_groupe_id, 'deleted', v_deleted_count);
end;
$$;

revoke all on function public.stock_mp_delete_lot_group(bigint) from public;
grant execute on function public.stock_mp_delete_lot_group(bigint) to service_role;

-- Enregistre un batch de sorties matiere premiere sous verrou advisory, avec
-- verification du stock disponible (meme principe que stock_record_sortie_batch
-- cote PF, mais sans la logique de reservation FIFO qui n'existe pas pour la
-- matiere premiere). p_lignes: jsonb array de
-- {lot_stock_id, quantite, client, n_doss_erp, n_doss_4d, utilisateur}
-- ou lot_stock_id designe n'importe quelle ligne du lot vise (sert juste a
-- retrouver l'article_id + numero_lot cible).
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

    insert into public.lots_stock_matiere_premiere (
      article_id, date_jour, numero_lot, code_normalise,
      qte_entree, qte_sortie, client, n_doss_erp, n_doss_4d, utilisateur,
      source_import
    ) values (
      v_article_id, current_date, v_numero_lot, upper(trim(v_code_normalise)),
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
