-- Fonctions de verrouillage stock/FIFO (plan: peppy-watching-steele).
-- A executer dans Supabase Dashboard > SQL Editor > New query.
-- Executer scripts/sql/mouvements_groupage.sql avant celui-ci (stock_deliver_commande
-- utilise la colonne mouvement_groupe_id ajoutee par ce fichier).
-- Ce fichier est livre et complete etape par etape (voir le plan) : a chaque
-- etape, colle le fichier entier (re-executer "create or replace" ne casse
-- rien pour les fonctions deja en place).
--
-- Etape 1/7 : helper de verrouillage partage + stock_delete_lot.
-- Etape 2/7 : stock_edit_lot.
-- Etape 3/7 : helpers de commentaire/meta + stock_deliver_commande.
-- Etape 4/7 : stock_override_fifo_result.
-- Etape 5/7 : stock_run_fifo (moteur principal).

-- Verrouille un ensemble d'articles pour la duree de la transaction en cours
-- (pg_advisory_xact_lock est relache automatiquement a la fin de la
-- transaction, donc a la fin de l'appel RPC qui l'invoque). Toujours appele
-- en premier, toujours avec la liste complete des articles touches, toujours
-- trie croissant : ca rend un deadlock entre ces fonctions impossible, quel
-- que soit l'ordre des appels concurrents.
create or replace function public._lock_articles_for_stock(p_article_ids bigint[])
returns void
language plpgsql
as $$
declare
  v_id bigint;
begin
  for v_id in
    select distinct x from unnest(p_article_ids) as x where x is not null order by x
  loop
    -- pg_advisory_xact_lock(int, int) exige deux arguments "integer" (pas
    -- bigint) - article_id reste largement dans cette plage donc le cast
    -- est sans risque.
    perform pg_advisory_xact_lock(778001001, v_id::int);
  end loop;
end;
$$;

revoke all on function public._lock_articles_for_stock(bigint[]) from public;

-- Remplace deleteLotStockAction (app/stock/actions.ts). Corrige le bug TOCTOU
-- actuel : entre la verification "aucun fifo_resultats ne reference ce lot"
-- et le DELETE, un calcul FIFO concurrent pouvait inserer une reservation sur
-- ce lot juste avant la suppression. Ici, tout se passe sous le verrou
-- advisory de l'article, donc aucun stock_run_fifo / stock_override_fifo_result
-- concurrent sur le meme article ne peut s'intercaler.
create or replace function public.stock_delete_lot(p_lot_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_article_id bigint;
  v_fifo_count int;
begin
  select article_id into v_article_id
  from public.lots_stock
  where id = p_lot_id;

  if v_article_id is null then
    raise exception 'Ligne stock invalide.';
  end if;

  perform public._lock_articles_for_stock(array[v_article_id]);

  -- Verrouille la ligne exacte (defense en profondeur, en plus du verrou
  -- advisory par article).
  perform 1 from public.lots_stock where id = p_lot_id for update;

  select count(*) into v_fifo_count
  from public.fifo_resultats
  where lot_stock_id = p_lot_id;

  if v_fifo_count > 0 then
    raise exception 'Impossible de supprimer: ce lot est utilise dans une commande FIFO.';
  end if;

  delete from public.lots_stock where id = p_lot_id;

  return jsonb_build_object('lot_id', p_lot_id, 'deleted', true);
end;
$$;

revoke all on function public.stock_delete_lot(bigint) from public;
grant execute on function public.stock_delete_lot(bigint) to service_role;

-- Remplace updateLotStockAction (app/stock/actions.ts). Aujourd'hui c'est un
-- UPDATE direct sans lecture prealable ni verrou ; on garde le meme
-- comportement (pas de recalcul metier ici) mais on le fait sous le verrou
-- advisory de l'article, pour qu'aucune lecture d'agregat concurrente
-- (stock_run_fifo, stock_create_commande, etc.) ne voie un etat intermediaire.
create or replace function public.stock_edit_lot(
  p_lot_id bigint,
  p_numero_lot text,
  p_date_fabrication date,
  p_qte_entree numeric,
  p_qte_sortie numeric,
  p_chambre text,
  p_code_pays text,
  p_note text
)
returns jsonb
language plpgsql
as $$
declare
  v_article_id bigint;
begin
  select article_id into v_article_id
  from public.lots_stock
  where id = p_lot_id;

  if v_article_id is null then
    raise exception 'Ligne stock invalide.';
  end if;

  perform public._lock_articles_for_stock(array[v_article_id]);

  perform 1 from public.lots_stock where id = p_lot_id for update;

  update public.lots_stock
  set
    numero_lot = p_numero_lot,
    code_normalise = upper(p_numero_lot),
    date_fabrication = p_date_fabrication,
    qte_entree = p_qte_entree,
    qte_sortie = p_qte_sortie,
    chambre = p_chambre,
    code_pays = p_code_pays,
    note = p_note
  where id = p_lot_id;

  return jsonb_build_object('lot_id', p_lot_id);
end;
$$;

revoke all on function public.stock_edit_lot(bigint, text, date, numeric, numeric, text, text, text) from public;
grant execute on function public.stock_edit_lot(bigint, text, date, numeric, numeric, text, text, text) to service_role;

-- Le champ commandes.commentaire est un texte libre encode en jetons
-- "PREFIXE:valeur" separes par " | " (ex: "PREPARATEUR_COMMANDE:...",
-- "STATUT_DATE_LIVREE:...", "DATE_TRANSITION_ENCOURS_LIVREE:..."). Ces
-- helpers portent fidelement extractPreparateur / upsertStatusDateComment /
-- upsertTransitionDateComment / upsertPreparateurComment (app/commandes/actions.ts).
create or replace function public._extract_comment_token(p_commentaire text, p_prefix text)
returns text
language plpgsql
as $$
declare
  parts text[];
  part text;
begin
  if p_commentaire is null then
    return '';
  end if;

  parts := regexp_split_to_array(p_commentaire, '\|');

  foreach part in array parts loop
    part := trim(part);
    if left(part, length(p_prefix)) = p_prefix then
      return trim(substring(part from length(p_prefix) + 1));
    end if;
  end loop;

  return '';
end;
$$;

revoke all on function public._extract_comment_token(text, text) from public;

-- Retire tout jeton existant avec ce prefixe, puis ajoute le nouveau
-- (sauf si p_value est vide/null, auquel cas le jeton est juste retire).
create or replace function public._upsert_comment_token(p_commentaire text, p_prefix text, p_value text)
returns text
language plpgsql
as $$
declare
  parts text[];
  part text;
  result text[] := '{}';
begin
  parts := regexp_split_to_array(coalesce(p_commentaire, ''), '\|');

  foreach part in array parts loop
    part := trim(part);
    if part <> '' and left(part, length(p_prefix)) <> p_prefix then
      result := array_append(result, part);
    end if;
  end loop;

  if p_value is not null and trim(p_value) <> '' then
    result := array_append(result, p_prefix || trim(p_value));
  end if;

  return array_to_string(result, ' | ');
end;
$$;

revoke all on function public._upsert_comment_token(text, text, text) from public;

create or replace function public._sanitize_meta_value(p_value text)
returns text
language sql
immutable
as $$
  select trim(replace(coalesce(p_value, ''), '|', '/'));
$$;

revoke all on function public._sanitize_meta_value(text) from public;

-- Port de buildCommandeSortieMetaLine (app/commandes/actions.ts).
create or replace function public._build_commande_sortie_meta_line(
  p_code text,
  p_livre_pour text,
  p_numero_bl text,
  p_preparateur text,
  p_quantite numeric
)
returns text
language plpgsql
as $$
declare
  v_code text := public._sanitize_meta_value(p_code);
  v_client text := public._sanitize_meta_value(p_livre_pour);
  v_bl text := public._sanitize_meta_value(p_numero_bl);
  v_prep text := public._sanitize_meta_value(p_preparateur);
  v_qty_text text;
begin
  if v_code = '' and v_client = '' and v_bl = '' and v_prep = '' then
    return '';
  end if;

  v_qty_text := case
    when p_quantite = trunc(p_quantite) then trunc(p_quantite)::text
    else p_quantite::text
  end;

  return 'SORTIEWEB|' || to_char(current_date, 'YYYY-MM-DD') || '|'
    || coalesce(nullif(v_code, ''), '-') || '|'
    || coalesce(nullif(v_client, ''), '-') || '|'
    || coalesce(nullif(v_bl, ''), '-') || '|'
    || coalesce(nullif(v_prep, ''), '-') || '|'
    || v_qty_text;
end;
$$;

revoke all on function public._build_commande_sortie_meta_line(text, text, text, text, numeric) from public;

-- Port de appendSortieMeta (une seule ligne a la fois, seul cas utilise).
create or replace function public._append_sortie_meta(p_existing_note text, p_line text)
returns text
language plpgsql
as $$
declare
  v_base text := trim(coalesce(p_existing_note, ''));
  v_line text := trim(coalesce(p_line, ''));
begin
  if v_line = '' then
    return nullif(v_base, '');
  end if;

  if v_base = '' then
    return v_line;
  end if;

  return v_base || E'\n' || v_line;
end;
$$;

revoke all on function public._append_sortie_meta(text, text) from public;

-- Remplace deliverCommandeAction (app/commandes/actions.ts). Verrouille tous
-- les articles references par les fifo_resultats de cette commande avant de
-- lire/ecrire, pour ne pas s'intercaler avec un stock_run_fifo ou un
-- stock_delete_lot concurrent sur les memes articles/lots.
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
  v_preparateur text;
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

  v_preparateur := public._extract_comment_token(v_commentaire, 'PREPARATEUR_COMMANDE:');

  for v_fifo in
    select lot_stock_id, quantite_chargee, numero_lot
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
      v_preparateur,
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

-- Remplace updateFifoResultAction (app/commandes/actions.ts). Note : dans
-- lots_stock (grand livre append-only), le solde "final" d'un lot (cle =
-- article_id + upper(trim(code_normalise ou numero_lot))) est simplement
-- sum(qte_entree - qte_sortie) sur toutes les lignes qui partagent cette cle
-- - la marche cumulative en JS (getLatestLotAvailabilityRows) ne sert qu'a
-- calculer ce meme total final pas a pas ; un GROUP BY sum donne le meme
-- resultat. Le "code n'existe pas / stock insuffisant" et le calcul de
-- reservation NE sont PAS filtres par statut LIVREE des commandes (meme
-- incoherence que dans le code actuel, preservee volontairement).
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

  -- La date/chambre representative d'un code est celle de sa ligne la plus
  -- ANCIENNE (date_fabrication minimum), pas la plus recente : c'est cette
  -- date-la qui determine quand le lot sort en FIFO, meme s'il a ete
  -- saisi dans le systeme plus tard. Meme convention que le VBA Excel
  -- (FIFO_Stock_Date_Entrer : dateDict ne se met a jour que si la nouvelle
  -- date est plus ancienne que celle deja stockee).
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
    quantite_chargee = p_quantite_chargee
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

-- Supprime totalement un mouvement TE/TS (toutes les lignes lots_stock qui
-- partagent le meme mouvement_groupe_id), pas juste une ligne. A la demande
-- explicite de l'utilisateur, supprime meme si une de ces lignes est
-- referencee dans fifo_resultats (utilisee par une commande) - dans ce cas
-- le resultat FIFO de la commande garde son propre instantane (numero_lot,
-- date_fabrication, quantite_chargee...) mais ne correspond plus a un lot
-- physique reel : la commande concernee doit etre reverifiee manuellement.
create or replace function public.stock_delete_lot_group(p_groupe_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_article_ids bigint[];
  v_deleted_count int;
begin
  select array_agg(distinct article_id) into v_article_ids
  from public.lots_stock
  where mouvement_groupe_id = p_groupe_id;

  if v_article_ids is null or array_length(v_article_ids, 1) is null then
    raise exception 'Mouvement introuvable.';
  end if;

  perform public._lock_articles_for_stock(v_article_ids);

  perform 1 from public.lots_stock where mouvement_groupe_id = p_groupe_id for update;

  -- fifo_resultats.lot_stock_id a une contrainte foreign key vers
  -- lots_stock.id : on casse la reference avant de supprimer (le resultat
  -- FIFO garde son propre instantane numero_lot/date_fabrication/quantite,
  -- donc il continue de s'afficher normalement).
  update public.fifo_resultats
  set lot_stock_id = null
  where lot_stock_id in (
    select id from public.lots_stock where mouvement_groupe_id = p_groupe_id
  );

  delete from public.lots_stock where mouvement_groupe_id = p_groupe_id;
  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object('groupe_id', p_groupe_id, 'deleted', v_deleted_count);
end;
$$;

revoke all on function public.stock_delete_lot_group(bigint) from public;
grant execute on function public.stock_delete_lot_group(bigint) to service_role;
