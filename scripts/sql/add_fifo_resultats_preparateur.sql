-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Le preparateur devient une donnee PAR LIGNE FIFO (un lot different peut
-- etre prepare par une personne differente), au lieu d'une seule valeur
-- partagee par toute la commande (stockee dans commandes.commentaire) -
-- reprend le meme comportement partout ou preparateur intervenait :
-- stock_override_fifo_result (Save d'une ligne), et le mot de sortie stock
-- ecrit par stock_deliver_commande (livraison), qui utilise desormais le
-- preparateur de CHAQUE ligne (avec repli sur l'ancienne valeur partagee
-- pour les lignes jamais resaisies depuis ce changement).

alter table public.fifo_resultats add column if not exists preparateur text;

create or replace function public.stock_override_fifo_result(
  p_fifo_id bigint,
  p_commande_id bigint,
  p_numero_lot text,
  p_preparateur text,
  p_quantite_chargee numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_article_id bigint;
  v_lot_stock_id bigint;
  v_current_quantite numeric;
  v_target_lot_id bigint;
  v_target_numero_lot text;
  v_target_date_fabrication date;
  v_target_chambre text;
  v_target_stock_restant numeric;
  v_reserved_qty numeric;
  v_current_qty_on_this_line numeric;
  v_available_qty numeric;
  v_total_shortage numeric := 0;
  v_line record;
  v_shortage numeric;
  v_commentaire text;
  v_statut text;
  v_next_commentaire text;
  v_next_statut text;
begin
  select article_id, lot_stock_id, quantite_chargee
  into v_article_id, v_lot_stock_id, v_current_quantite
  from public.fifo_resultats
  where id = p_fifo_id and commande_id = p_commande_id;

  if not found then
    raise exception 'Ligne FIFO introuvable.';
  end if;

  perform public._lock_articles_for_stock(array[v_article_id]);

  select
    (array_agg(ls.id order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    (array_agg(coalesce(nullif(ls.numero_lot, ''), ls.code_normalise) order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    (array_agg(ls.date_fabrication order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    (array_agg(ls.chambre order by ls.date_fabrication asc nulls last, ls.id asc))[1],
    sum(coalesce(ls.qte_entree, 0) - coalesce(ls.qte_sortie, 0))
  into v_target_lot_id, v_target_numero_lot, v_target_date_fabrication, v_target_chambre, v_target_stock_restant
  from public.lots_stock ls
  where ls.article_id = v_article_id
    and upper(trim(coalesce(nullif(ls.code_normalise, ''), ls.numero_lot))) = upper(trim(p_numero_lot))
  group by upper(trim(coalesce(nullif(ls.code_normalise, ''), ls.numero_lot)))
  having sum(coalesce(ls.qte_entree, 0) - coalesce(ls.qte_sortie, 0)) > 0;

  if not found then
    raise exception 'Ce code n''existe pas pour cet article dans le stock.';
  end if;

  select coalesce(sum(quantite_chargee), 0)
  into v_reserved_qty
  from public.fifo_resultats
  where lot_stock_id = v_target_lot_id and id <> p_fifo_id;

  v_current_qty_on_this_line := case when v_target_lot_id = v_lot_stock_id then coalesce(v_current_quantite, 0) else 0 end;
  v_available_qty := greatest(0, v_target_stock_restant - v_reserved_qty + v_current_qty_on_this_line);

  if p_quantite_chargee > v_available_qty then
    raise exception 'Stock insuffisant sur ce code. Disponible: %', v_available_qty;
  end if;

  update public.fifo_resultats
  set
    lot_stock_id = v_target_lot_id,
    numero_lot = v_target_numero_lot,
    date_fabrication = v_target_date_fabrication,
    chambre = v_target_chambre,
    quantite_chargee = p_quantite_chargee,
    preparateur = p_preparateur
  where id = p_fifo_id;

  for v_line in
    select
      cl.id,
      cl.quantite_demandee,
      coalesce((select sum(fr.quantite_chargee) from public.fifo_resultats fr where fr.commande_ligne_id = cl.id), 0) as charged
    from public.commande_lignes cl
    where cl.commande_id = p_commande_id
  loop
    v_shortage := greatest(0, coalesce(v_line.quantite_demandee, 0) - v_line.charged);
    v_total_shortage := v_total_shortage + v_shortage;

    update public.commande_lignes set qt_non_dispo_total = v_shortage where id = v_line.id;
  end loop;

  select commentaire, statut into v_commentaire, v_statut
  from public.commandes
  where id = p_commande_id;

  if not found then
    raise exception 'Commande introuvable.';
  end if;

  v_next_statut := case when v_total_shortage > 0 then 'FIFO_PARTIEL' else 'FIFO_CALCULE' end;
  -- Garde une valeur "de secours" au niveau de la commande, pour les
  -- lignes jamais resaisies depuis ce changement (voir stock_deliver_commande).
  v_next_commentaire := public._upsert_comment_token(v_commentaire, 'PREPARATEUR_COMMANDE:', p_preparateur);
  v_next_commentaire := public._upsert_comment_token(v_next_commentaire, 'STATUT_DATE_EN_COURS:', to_char(current_date, 'YYYY-MM-DD'));
  v_next_commentaire := public._upsert_comment_token(v_next_commentaire, 'DATE_TRANSITION_STAND_ENCOURS:', to_char(current_date, 'YYYY-MM-DD'));

  update public.commandes
  set commentaire = v_next_commentaire, statut = v_next_statut
  where id = p_commande_id;

  return jsonb_build_object('commande_id', p_commande_id, 'statut', v_next_statut, 'total_shortage', v_total_shortage);
end;
$$;

revoke all on function public.stock_override_fifo_result(bigint, bigint, text, text, numeric) from public;
grant execute on function public.stock_override_fifo_result(bigint, bigint, text, text, numeric) to service_role;

create or replace function public.stock_deliver_commande(p_commande_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_statut text;
  v_commentaire text;
  v_numero_proforma text;
  v_client text;
  v_article_ids bigint[];
  v_preparateur_commande text;
  v_fifo_total int;
  v_fifo record;
  v_lot_id bigint;
  v_lot_article_id bigint;
  v_lot_numero_lot text;
  v_lot_code_normalise text;
  v_lot_date_fabrication date;
  v_lot_chambre text;
  v_lot_code_pays text;
  v_lot_note text;
  v_meta_line text;
  v_count int := 0;
  v_new_id bigint;
  v_new_ids bigint[] := '{}';
  v_group_id bigint;
begin
  select statut, commentaire, numero_proforma, client
  into v_statut, v_commentaire, v_numero_proforma, v_client
  from public.commandes
  where id = p_commande_id;

  if not found then
    raise exception 'Commande introuvable.';
  end if;

  if v_statut = 'LIVREE' then
    raise exception 'Cette commande est deja livree.';
  end if;

  select count(*) into v_fifo_total
  from public.fifo_resultats
  where commande_id = p_commande_id;

  if v_fifo_total = 0 then
    raise exception 'Calcule d''abord le FIFO avant de livrer la commande.';
  end if;

  select coalesce(array_agg(distinct ls.article_id), '{}')
  into v_article_ids
  from public.fifo_resultats fr
  join public.lots_stock ls on ls.id = fr.lot_stock_id
  where fr.commande_id = p_commande_id;

  perform public._lock_articles_for_stock(v_article_ids);

  -- Repli utilise seulement pour une ligne dont le preparateur n'a jamais
  -- ete resaisi depuis l'ajout de fifo_resultats.preparateur.
  v_preparateur_commande := public._extract_comment_token(v_commentaire, 'PREPARATEUR_COMMANDE:');

  for v_fifo in
    select lot_stock_id, quantite_chargee, numero_lot, preparateur
    from public.fifo_resultats
    where commande_id = p_commande_id
  loop
    v_lot_id := v_fifo.lot_stock_id;

    select article_id, numero_lot, code_normalise, date_fabrication, chambre, code_pays, note
    into v_lot_article_id, v_lot_numero_lot, v_lot_code_normalise, v_lot_date_fabrication, v_lot_chambre, v_lot_code_pays, v_lot_note
    from public.lots_stock
    where id = v_lot_id;

    if not found or v_lot_article_id is null then
      raise exception 'Lot introuvable: %', coalesce(v_lot_id, 0);
    end if;

    v_meta_line := public._build_commande_sortie_meta_line(
      coalesce(v_fifo.numero_lot, v_lot_numero_lot, v_numero_proforma, ''),
      coalesce(v_client, ''),
      coalesce(v_numero_proforma, ''),
      coalesce(nullif(v_fifo.preparateur, ''), v_preparateur_commande, ''),
      coalesce(v_fifo.quantite_chargee, 0)
    );

    insert into public.lots_stock (
      article_id, date_jour, numero_lot, code_normalise, date_fabrication,
      qte_entree, qte_sortie, chambre, code_pays, source_import, note
    ) values (
      v_lot_article_id,
      current_date,
      coalesce(v_lot_numero_lot, v_fifo.numero_lot, ''),
      coalesce(v_lot_code_normalise, upper(coalesce(v_lot_numero_lot, v_fifo.numero_lot, ''))),
      v_lot_date_fabrication,
      0,
      coalesce(v_fifo.quantite_chargee, 0),
      v_lot_chambre,
      v_lot_code_pays,
      'web:sortie-commande',
      public._append_sortie_meta(v_lot_note, v_meta_line)
    )
    returning id into v_new_id;

    v_new_ids := array_append(v_new_ids, v_new_id);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Aucune ligne FIFO a livrer.';
  end if;

  select min(x) into v_group_id from unnest(v_new_ids) x;

  update public.lots_stock
  set mouvement_groupe_id = v_group_id
  where id = any(v_new_ids);

  v_commentaire := public._upsert_comment_token(v_commentaire, 'STATUT_DATE_LIVREE:', to_char(current_date, 'YYYY-MM-DD'));
  v_commentaire := public._upsert_comment_token(v_commentaire, 'DATE_TRANSITION_ENCOURS_LIVREE:', to_char(current_date, 'YYYY-MM-DD'));
  v_commentaire := v_commentaire || case when v_commentaire <> '' then ' | ' else '' end || 'Sortie stock validee depuis la web';

  update public.commandes
  set statut = 'LIVREE', commentaire = v_commentaire
  where id = p_commande_id;

  return jsonb_build_object('commande_id', p_commande_id, 'lignes_livrees', v_count, 'groupe_id', v_group_id);
end;
$$;

revoke all on function public.stock_deliver_commande(bigint) from public;
grant execute on function public.stock_deliver_commande(bigint) to service_role;
