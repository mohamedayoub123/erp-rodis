-- Fonction de sortie manuelle (page /mouvements/sortie).
-- Depend de scripts/sql/mouvements_groupage.sql (colonne mouvement_groupe_id)
-- et de scripts/sql/stock_locking_functions.sql (_lock_articles_for_stock,
-- _build_commande_sortie_meta_line) : executer ces deux fichiers AVANT celui-ci.
--
-- Avant, une sortie manuelle modifiait directement la ligne lots_stock de
-- l'entree (qte_sortie += quantite), ce qui empechait de regrouper plusieurs
-- sorties sous un seul code TS et cassait le principe de grand livre
-- append-only deja utilise par les imports Excel et les livraisons de
-- commande. Maintenant chaque sortie manuelle insere une NOUVELLE ligne
-- lots_stock (comme une livraison), et toutes les lignes creees dans le
-- meme clic "Approuver sortie" partagent le meme mouvement_groupe_id (= un
-- seul code TS pour tout le lot approuve, meme s'il touche plusieurs
-- articles/lots).
create or replace function public.stock_record_sortie_batch(p_lignes jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_ligne jsonb;
  v_lot_stock_id bigint;
  v_quantite numeric;
  v_code text;
  v_livre_pour text;
  v_numero_bl text;
  v_preparateur text;
  v_article_id bigint;
  v_numero_lot text;
  v_code_normalise text;
  v_chambre text;
  v_code_pays text;
  v_date_fabrication date;
  v_lot_key text;
  v_balance numeric;
  v_reserved numeric;
  v_claimed numeric;
  v_available numeric;
  v_article_ids bigint[] := '{}';
  v_claimed_by_key jsonb := '{}'::jsonb;
  v_new_id bigint;
  v_new_ids bigint[] := '{}';
  v_group_id bigint;
  v_meta_line text;
begin
  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucune sortie a approuver.';
  end if;

  -- Premiere passe : collecter tous les articles touches pour les verrouiller
  -- ensemble, toujours en ordre croissant (meme discipline anti-deadlock que
  -- les fonctions stock_* de app/commandes/actions.ts).
  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_lot_stock_id := (v_ligne->>'lot_stock_id')::bigint;

    select article_id into v_article_id
    from public.lots_stock
    where id = v_lot_stock_id;

    if v_article_id is null then
      raise exception 'Lot introuvable.';
    end if;

    if not (v_article_id = any(v_article_ids)) then
      v_article_ids := array_append(v_article_ids, v_article_id);
    end if;
  end loop;

  perform public._lock_articles_for_stock(v_article_ids);

  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_lot_stock_id := (v_ligne->>'lot_stock_id')::bigint;
    v_quantite := (v_ligne->>'quantite')::numeric;
    v_code := coalesce(v_ligne->>'code', '');
    v_livre_pour := coalesce(v_ligne->>'livre_pour', '');
    v_numero_bl := coalesce(v_ligne->>'numero_bl', '');
    v_preparateur := coalesce(v_ligne->>'preparateur', '');

    if v_lot_stock_id is null or v_quantite is null or v_quantite <= 0 then
      raise exception 'Une sortie est incomplete ou invalide.';
    end if;

    select
      article_id,
      coalesce(nullif(numero_lot, ''), code_normalise),
      coalesce(nullif(code_normalise, ''), numero_lot),
      chambre,
      code_pays,
      date_fabrication
    into v_article_id, v_numero_lot, v_code_normalise, v_chambre, v_code_pays, v_date_fabrication
    from public.lots_stock
    where id = v_lot_stock_id;

    if v_article_id is null then
      raise exception 'Lot introuvable.';
    end if;

    v_lot_key := v_article_id || '::' || upper(trim(v_code_normalise));

    select coalesce(sum(coalesce(qte_entree, 0) - coalesce(qte_sortie, 0)), 0)
    into v_balance
    from public.lots_stock
    where article_id = v_article_id
      and upper(trim(coalesce(nullif(code_normalise, ''), numero_lot))) = upper(trim(v_code_normalise));

    select coalesce(sum(fr.quantite_chargee), 0)
    into v_reserved
    from public.fifo_resultats fr
    join public.lots_stock ls2 on ls2.id = fr.lot_stock_id
    join public.commandes c on c.id = fr.commande_id
    where ls2.article_id = v_article_id
      and upper(trim(coalesce(nullif(ls2.code_normalise, ''), ls2.numero_lot))) = upper(trim(v_code_normalise))
      and c.statut <> 'LIVREE';

    v_claimed := coalesce((v_claimed_by_key->>v_lot_key)::numeric, 0);
    v_available := greatest(0, v_balance - v_reserved - v_claimed);

    if v_quantite > v_available then
      raise exception 'Quantite trop grande pour le lot %. Disponible reel: %',
        coalesce(nullif(v_numero_lot, ''), v_code_normalise), v_available;
    end if;

    v_claimed_by_key := jsonb_set(v_claimed_by_key, array[v_lot_key], to_jsonb(v_claimed + v_quantite));

    v_meta_line := public._build_commande_sortie_meta_line(v_code, v_livre_pour, v_numero_bl, v_preparateur, v_quantite);

    insert into public.lots_stock (
      article_id, date_jour, numero_lot, code_normalise, date_fabrication,
      qte_entree, qte_sortie, chambre, code_pays, source_import, note
    ) values (
      v_article_id, current_date, v_numero_lot, upper(trim(v_code_normalise)), v_date_fabrication,
      0, v_quantite, v_chambre, v_code_pays, 'web:sortie', nullif(v_meta_line, '')
    )
    returning id into v_new_id;

    v_new_ids := array_append(v_new_ids, v_new_id);
  end loop;

  select min(x) into v_group_id from unnest(v_new_ids) x;

  update public.lots_stock
  set mouvement_groupe_id = v_group_id
  where id = any(v_new_ids);

  return jsonb_build_object('groupe_id', v_group_id, 'ids', to_jsonb(v_new_ids));
end;
$$;

revoke all on function public.stock_record_sortie_batch(jsonb) from public;
grant execute on function public.stock_record_sortie_batch(jsonb) to service_role;
