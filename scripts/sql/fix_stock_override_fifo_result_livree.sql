-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET V1/PRODUCTION.
--
-- stock_override_fifo_result (appelee par "Enregistrer tout" et "combler le
-- manque" sur la page Commande) comptait TOUTES les fifo_resultats du meme
-- lot_stock_id comme "deja reservees ailleurs" pour calculer la quantite
-- disponible - y compris celles de commandes DEJA LIVREES, dont la sortie
-- de stock reelle est deja enregistree dans lots_stock (qte_sortie). Meme
-- bug de fond que celui deja corrige cote JS (computeAvailableCodesByArticle
-- dans app/commandes/[id]/page.tsx, fetchAllReservedLotsExcludingCommande
-- dans app/commandes/actions.ts) : ici c'etait le dernier endroit ou
-- l'ancienne logique non filtree subsistait encore, provoquant "Stock
-- insuffisant sur ce code" au moment d'Enregistrer un code que le FIFO
-- venait lui-meme de choisir (constate sur la proforma 3867-4, bloque par
-- des restes de fifo_resultats de la commande 3889, deja LIVREE).
--
-- Seul le calcul de v_reserved_qty change (jointure vers commandes + exclusion
-- statut LIVREE) - tout le reste de la fonction est identique a
-- add_fifo_resultats_preparateur.sql.
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

  -- Reservations d'AUTRES lignes FIFO sur ce meme lot, EN EXCLUANT celles
  -- des commandes deja LIVREES (deja sorties du stock reel via
  -- stock_deliver_commande - les recompter ici les deduirait 2 fois).
  select coalesce(sum(fr.quantite_chargee), 0)
  into v_reserved_qty
  from public.fifo_resultats fr
  join public.commandes c on c.id = fr.commande_id
  where fr.lot_stock_id = v_target_lot_id
    and fr.id <> p_fifo_id
    and c.statut <> 'LIVREE';

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
