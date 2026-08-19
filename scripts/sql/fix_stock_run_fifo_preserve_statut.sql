-- A coller dans Supabase Dashboard > SQL Editor > New query.
--
-- Redepose stock_run_fifo (le "Despatcher" FIFO d'une commande) tel qu'il
-- est deja ecrit dans scripts/sql/stock_locking_functions.sql - AUCUNE
-- LOGIQUE CHANGEE ici, ce fichier ne fait que confirmer/reappliquer cette
-- meme fonction seule (sans toucher aux autres fonctions du gros fichier,
-- au cas ou certaines auraient ete corrigees separement depuis - voir
-- fix_stock_override_fifo_result_livree.sql /
-- fix_stock_override_fifo_result_date_en_cours.sql).
--
-- Pourquoi : la fonction protege deja le statut d'une commande deja avancee
-- (Stand / BL_TRANSFORME / Livree, via _statut_bucket) - elle n'ecrit
-- FIFO_PARTIEL/FIFO_CALCULE (affiche "En cours") QUE si le statut actuel
-- est deja dans le bucket "En cours" (EN_COURS/FIFO_PARTIEL/FIFO_CALCULE/
-- SAISIE_WEB). Si le bug "une commande BL transforme repasse a En cours
-- quand je fais Dispatch" persiste malgre ca, c'est que la version DEJA
-- EN LIGNE dans Supabase est plus ancienne que cette protection - ce
-- fichier la remet a jour (create or replace, sans risque pour les
-- commandes/lignes existantes).
create or replace function public.stock_run_fifo(
  p_commande_id bigint,
  p_ordered_ligne_ids bigint[]
)
returns jsonb
language plpgsql
as $$
declare
  v_statut text;
  v_commentaire text;
  v_mode_chargement text;
  v_client text;
  v_is_container boolean;
  v_is_uganda_client boolean;
  v_article_ids bigint[];
  v_expected_count int;
  v_ligne_id bigint;
  v_ligne_article_id bigint;
  v_ligne_quantite_demandee numeric;
  v_ligne_type_article text;
  v_type_lower text;
  v_stock_total numeric;
  v_stock_2_mois numeric;
  v_max_allowed numeric;
  v_qty_to_load numeric;
  v_charged numeric;
  v_shortage numeric;
  v_total_shortage numeric := 0;
  v_rule_name text;
  v_final_rule_name text;
  v_has_code_pays_lot boolean;
  v_ordre int := 1;
  v_lot record;
  v_take numeric;
  v_new_statut text;
  v_final_statut text;
  v_comment_with_dates text;
  v_final_commentaire text;
begin
  select statut, commentaire, mode_chargement, client
  into v_statut, v_commentaire, v_mode_chargement, v_client
  from public.commandes
  where id = p_commande_id;

  if not found then
    raise exception 'Commande introuvable.';
  end if;

  if upper(coalesce(v_statut, '')) = 'LIVREE' then
    raise exception 'Cette commande est deja livree, impossible de redispatcher.';
  end if;

  select count(*) into v_expected_count
  from public.commande_lignes
  where commande_id = p_commande_id;

  if v_expected_count = 0 then
    raise exception 'Cette commande ne contient aucune ligne.';
  end if;

  if coalesce(array_length(p_ordered_ligne_ids, 1), 0) <> v_expected_count then
    raise exception 'Liste de lignes invalide.';
  end if;

  if (select count(distinct x) from unnest(p_ordered_ligne_ids) as x) <> v_expected_count then
    raise exception 'Liste de lignes invalide (doublons).';
  end if;

  if exists (
    select 1 from unnest(p_ordered_ligne_ids) as t(id)
    where not exists (
      select 1 from public.commande_lignes cl where cl.id = t.id and cl.commande_id = p_commande_id
    )
  ) then
    raise exception 'Liste de lignes invalide (ligne hors commande).';
  end if;

  select coalesce(array_agg(distinct article_id), '{}')
  into v_article_ids
  from public.commande_lignes
  where commande_id = p_commande_id;

  perform public._lock_articles_for_stock(v_article_ids);

  v_is_container := (
    upper(coalesce(v_mode_chargement, '')) like 'TC%'
    or position('CONTINAIR' in upper(coalesce(v_mode_chargement, ''))) > 0
    or position('CONTENAIR' in upper(coalesce(v_mode_chargement, ''))) > 0
    or position('CONTENEUR' in upper(coalesce(v_mode_chargement, ''))) > 0
    or position('CONTAINER' in upper(coalesce(v_mode_chargement, ''))) > 0
  );

  v_is_uganda_client := public._client_is_from_country(v_client, 'ouganda');

  -- Instantane des lots (agrege par article + code, plus ancienne
  -- date_fabrication represente le lot, meme convention que
  -- buildStockSnapshot / stock_override_fifo_result).
  create temporary table tmp_lot_agg (
    article_id bigint,
    lot_id bigint,
    numero_lot text,
    date_fabrication date,
    chambre text,
    code_pays text,
    stock_restant numeric
  ) on commit drop;

  insert into tmp_lot_agg
  select
    ls.article_id,
    (array_agg(ls.id order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    (array_agg(coalesce(nullif(ls.numero_lot, ''), ls.code_normalise) order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    (array_agg(ls.date_fabrication order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    (array_agg(ls.chambre order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    (array_agg(ls.code_pays order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    sum(coalesce(ls.qte_entree, 0) - coalesce(ls.qte_sortie, 0))
  from public.lots_stock ls
  where ls.article_id = any(v_article_ids)
  group by ls.article_id, upper(trim(coalesce(nullif(ls.code_normalise, ''), ls.numero_lot)))
  having sum(coalesce(ls.qte_entree, 0) - coalesce(ls.qte_sortie, 0)) > 0;

  -- Disponibilite BRUTE par article (plafond par regle : stock_2_mois pour
  -- un clarifiant en mode container, stock_total sinon) - PAS nette des
  -- reservations d'autres commandes, exactement comme articleAvailabilityMap
  -- cote TS.
  create temporary table tmp_article_availability (
    article_id bigint primary key,
    stock_total numeric,
    stock_2_mois numeric
  ) on commit drop;

  insert into tmp_article_availability
  select
    article_id,
    sum(stock_restant),
    sum(case
      when date_fabrication is not null
        and public._months_between_calendar(date_fabrication, current_date) <= 2
      then stock_restant else 0
    end)
  from tmp_lot_agg
  group by article_id;

  -- Disponibilite NETTE par lot (sert au chargement reel, deduite des
  -- reservations d'autres commandes non livrees, exactement comme
  -- lotsByArticle / fetchAllReservedLotsExcludingCommande cote TS).
  create temporary table tmp_lot_state (
    lot_id bigint primary key,
    article_id bigint,
    numero_lot text,
    date_fabrication date,
    chambre text,
    code_pays text,
    remaining numeric
  ) on commit drop;

  insert into tmp_lot_state
  select
    la.lot_id, la.article_id, la.numero_lot, la.date_fabrication, la.chambre, la.code_pays,
    greatest(0, la.stock_restant - coalesce(r.qty, 0))
  from tmp_lot_agg la
  left join (
    select fr.lot_stock_id, sum(fr.quantite_chargee) as qty
    from public.fifo_resultats fr
    join public.commandes c on c.id = fr.commande_id
    where fr.commande_id <> p_commande_id
      and upper(coalesce(c.statut, '')) <> 'LIVREE'
    group by fr.lot_stock_id
  ) r on r.lot_stock_id = la.lot_id;

  create temporary table tmp_candidate_lots (
    lot_id bigint,
    remaining numeric,
    date_fabrication date,
    chambre text,
    code_pays text,
    rule_rank int
  ) on commit drop;

  delete from public.fifo_resultats where commande_id = p_commande_id;

  foreach v_ligne_id in array p_ordered_ligne_ids loop
    select cl.article_id, cl.quantite_demandee, a.type_article
    into v_ligne_article_id, v_ligne_quantite_demandee, v_ligne_type_article
    from public.commande_lignes cl
    left join public.articles a on a.id = cl.article_id
    where cl.id = v_ligne_id;

    v_type_lower := lower(trim(coalesce(v_ligne_type_article, '')));

    select stock_total, stock_2_mois
    into v_stock_total, v_stock_2_mois
    from tmp_article_availability
    where article_id = v_ligne_article_id;

    v_stock_total := coalesce(v_stock_total, 0);
    v_stock_2_mois := coalesce(v_stock_2_mois, 0);

    if v_is_container and v_type_lower = 'clarifiant' then
      v_max_allowed := v_stock_2_mois;
    else
      v_max_allowed := v_stock_total;
    end if;

    v_qty_to_load := least(coalesce(v_ligne_quantite_demandee, 0), v_max_allowed);

    truncate tmp_candidate_lots;

    if not v_is_container then
      v_rule_name := 'FIFO WEB STANDARD';
      insert into tmp_candidate_lots
      select lot_id, remaining, date_fabrication, chambre, code_pays,
        row_number() over (order by date_fabrication asc nulls first, lot_id asc)
      from tmp_lot_state
      where article_id = v_ligne_article_id and remaining > 0;
    elsif v_type_lower = 'clarifiant' then
      v_rule_name := 'FIFO WEB CONTINAIR CLARIFIANT <= 2 MOIS';
      insert into tmp_candidate_lots
      select lot_id, remaining, date_fabrication, chambre, code_pays,
        row_number() over (order by date_fabrication desc, lot_id asc)
      from tmp_lot_state
      where article_id = v_ligne_article_id and remaining > 0
        and date_fabrication is not null
        and public._months_between_calendar(date_fabrication, current_date) <= 2;
    else
      v_rule_name := 'FIFO WEB CONTINAIR PLUS RECENT D''ABORD';
      insert into tmp_candidate_lots
      select lot_id, remaining, date_fabrication, chambre, code_pays,
        row_number() over (order by date_fabrication desc nulls last, lot_id asc)
      from tmp_lot_state
      where article_id = v_ligne_article_id and remaining > 0;
    end if;

    select exists(select 1 from tmp_candidate_lots where trim(coalesce(code_pays, '')) <> '')
    into v_has_code_pays_lot;

    v_final_rule_name := case
      when v_is_uganda_client and v_has_code_pays_lot then v_rule_name || ' + CODE PAYS OUGANDA'
      else v_rule_name
    end;

    v_charged := 0;

    for v_lot in
      select lot_id, remaining, date_fabrication, chambre, code_pays
      from tmp_candidate_lots
      order by
        case when v_is_uganda_client and v_has_code_pays_lot and trim(coalesce(code_pays, '')) <> '' then 0 else 1 end,
        rule_rank
    loop
      exit when v_qty_to_load <= 0;
      if v_lot.remaining <= 0 then
        continue;
      end if;

      v_take := least(v_qty_to_load, v_lot.remaining);
      if v_take <= 0 then
        continue;
      end if;

      insert into public.fifo_resultats (
        commande_id, commande_ligne_id, article_id, lot_stock_id, numero_lot,
        date_fabrication, chambre, quantite_chargee, ordre_ligne, regle_appliquee
      )
      select
        p_commande_id, v_ligne_id, v_ligne_article_id, v_lot.lot_id, ts.numero_lot,
        v_lot.date_fabrication, v_lot.chambre, v_take, v_ordre, v_final_rule_name
      from tmp_lot_state ts
      where ts.lot_id = v_lot.lot_id;

      update tmp_lot_state set remaining = remaining - v_take where lot_id = v_lot.lot_id;

      v_qty_to_load := v_qty_to_load - v_take;
      v_charged := v_charged + v_take;
      v_ordre := v_ordre + 1;
    end loop;

    v_shortage := greatest(0, coalesce(v_ligne_quantite_demandee, 0) - v_charged);
    v_total_shortage := v_total_shortage + v_shortage;

    update public.commande_lignes set qt_non_dispo_total = v_shortage where id = v_ligne_id;
  end loop;

  v_new_statut := case when v_total_shortage > 0 then 'FIFO_PARTIEL' else 'FIFO_CALCULE' end;
  v_final_statut := case
    when public._statut_bucket(v_statut) = 'EN_COURS' then v_new_statut
    else coalesce(nullif(v_statut, ''), v_new_statut)
  end;

  v_comment_with_dates := public._stamp_status_dates_if_needed(v_commentaire, v_statut, v_final_statut);

  v_final_commentaire := v_comment_with_dates
    || case when v_comment_with_dates <> '' then ' | ' else '' end
    || 'FIFO web calcule automatiquement'
    || case when v_total_shortage > 0 then ' | Reste a charger: ' || v_total_shortage::text else '' end;

  update public.commandes
  set statut = v_final_statut, commentaire = v_final_commentaire
  where id = p_commande_id;

  return jsonb_build_object(
    'commande_id', p_commande_id,
    'statut', v_final_statut,
    'total_shortage', v_total_shortage
  );
end;
$$;

revoke all on function public.stock_run_fifo(bigint, bigint[]) from public;
grant execute on function public.stock_run_fifo(bigint, bigint[]) to service_role;
