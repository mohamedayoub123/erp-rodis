-- ============================================================
-- SYNC V2 (dev) sur V1 (prod) - a coller dans Supabase Dashboard
-- (projet V2 / dev) > SQL Editor > New query, puis Run.
--
-- Contenu : tout ce qui a ete ajoute a V1 (tables, colonnes, fonctions,
-- index) et qui manque encore dans V2, verifie colonne par colonne contre
-- la vraie base V2 avant de generer ce fichier (pas une simple copie de
-- tous les scripts). Les fichiers deja presents dans V2 ont ete exclus.
--
-- Chaque section = un des scripts dans scripts/sql/, dans l'ordre ou ils
-- ont ete appliques a V1. Tout est ecrit en "if not exists" / "create or
-- replace" - sans risque de rejouer une section qui serait deja passee.
-- ============================================================

-- ------------------------------------------------------------
-- scripts/sql/change_stabilite_to_text.sql
-- ------------------------------------------------------------
-- La stabilite etait un champ numerique, mais en pratique c'est un choix
-- binaire (Stable / Non stable) fait dans le formulaire - passage en texte
-- pour stocker directement ce choix au lieu d'un chiffre.
-- Les anciennes valeurs numeriques existantes sont converties en texte tel
-- quel (ex: 12.5 -> "12.5") - elles restent visibles dans l'historique mais
-- ne correspondent plus a une saisie "Stable"/"Non stable".
alter table public.production_rapports
  alter column stabilite type text using stabilite::text;

-- ------------------------------------------------------------
-- scripts/sql/fix_programme_lignes_groupe_id.sql
-- ------------------------------------------------------------
-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Corrige programme_lignes.groupe_id : le code insere d'abord les lignes
-- SANS groupe_id puis fait un UPDATE pour le remplir avec le min(id) du lot
-- (meme pattern que mouvement_groupe_id dans lots_stock) - la colonne doit
-- donc etre nullable, pas "not null".
alter table public.programme_lignes
  alter column groupe_id drop not null;

-- ------------------------------------------------------------
-- scripts/sql/mouvements_functions.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- scripts/sql/stock_locking_functions.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- scripts/sql/stock_locking_indexes.sql
-- ------------------------------------------------------------
-- Etape 0 du plan de verrouillage SQL : index de preparation.
-- A executer une seule fois dans Supabase Dashboard > SQL Editor > New query.
-- Ces index reduisent le temps passe sous verrou par les futures fonctions
-- stock_* (elles lisent lots_stock/fifo_resultats/commande_lignes en entier
-- pendant qu'elles detiennent un verrou pg_advisory_xact_lock par article).

create index if not exists idx_lots_stock_article_date
  on public.lots_stock (article_id, date_jour, id);

create index if not exists idx_fifo_resultats_commande
  on public.fifo_resultats (commande_id);

create index if not exists idx_fifo_resultats_lot
  on public.fifo_resultats (lot_stock_id);

create index if not exists idx_commande_lignes_commande
  on public.commande_lignes (commande_id);

-- ------------------------------------------------------------
-- scripts/sql/add_lots_matiere_premiere_note.sql
-- ------------------------------------------------------------
alter table public.lots_matiere_premiere
  add column if not exists note text;

-- ------------------------------------------------------------
-- scripts/sql/fix_sortie_mp_dates.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- scripts/sql/add_note_support_sortie_mp_rpc.sql
-- ------------------------------------------------------------
-- Ajoute le support de "note" dans le batch de sortie MP (l'entree l'a deja
-- puisqu'elle insere directement depuis le code applicatif - seule la
-- sortie passe par cette RPC). Redefinition complete, meme signature.
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
      note, source_import
    ) values (
      v_article_id, current_date, v_numero_lot, upper(trim(v_code_normalise)),
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

-- ------------------------------------------------------------
-- scripts/sql/add_date_sortie_support_sortie_mp_rpc.sql
-- ------------------------------------------------------------
-- La sortie MP prenait toujours la date du jour (current_date) comme
-- date_jour, sans que l'utilisateur puisse la choisir - contrairement a
-- l'entree qui a deja son propre champ "Date de reception". Ajoute un champ
-- date_sortie choisi par l'utilisateur, utilise comme date_jour. Redefinition
-- complete, meme signature.
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

-- ------------------------------------------------------------
-- scripts/sql/consolidate_sortie_mp_rpc_grouping_date_note.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- scripts/sql/allow_negative_stock_sortie_mp_free_article.sql
-- ------------------------------------------------------------
-- Remplace stock_mp_record_sortie_batch (dernier remplacant :
-- consolidate_sortie_mp_rpc_grouping_date_note.sql) - deux changements a la
-- demande de l'utilisateur :
--   1. Prend article_id + numero_lot directement (au lieu de lot_stock_id)
--      pour pouvoir sortir un article qui n'a JAMAIS eu d'entree du tout,
--      pas seulement un lot deja existant.
--   2. Retire le blocage "stock insuffisant" - le stock peut partir en
--      negatif, saisie manuelle assumee par l'utilisateur.
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
  -- ensemble, toujours en ordre croissant (meme discipline anti-deadlock que
  -- les fonctions stock_* PF), meme si le blocage stock insuffisant a
  -- disparu - le verrou reste utile contre deux sorties concurrentes qui
  -- ecriraient en meme temps.
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

    if v_article_id is null or v_numero_lot is null or v_quantite is null or v_quantite <= 0 then
      raise exception 'Une sortie est incomplete ou invalide.';
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

-- ------------------------------------------------------------
-- scripts/sql/add_stock_check_sortie_mp_normal_mode.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- scripts/sql/add_bc_mp_atomic_code_generation.sql
-- ------------------------------------------------------------
-- Le code BC (BC1, BC2...) etait calcule cote application : compter les
-- codes distincts existants, prendre le suivant, puis inserer. Si deux
-- personnes enregistrent une commande a quelques millisecondes d'ecart,
-- les deux comptages peuvent s'executer avant que l'un ou l'autre insert
-- n'ait eu lieu - les deux recoivent alors le MEME code, silencieusement.
--
-- Fixe avec une sequence Postgres plutot qu'un verrou applicatif + comptage
-- (nextval() est atomique par construction, garanti sans collision meme
-- sous forte concurrence, contrairement a "compter puis inserer" qui reste
-- vulnerable a la course quel que soit le verrou pose autour). Pas de
-- contrainte unique sur "code" : plusieurs lignes (une par article) partagent
-- volontairement le meme code au sein d'un meme BC, donc "code" n'est pas
-- unique par ligne, seulement genere une fois par lot d'enregistrement.
do $$
declare
  v_next integer;
begin
  select coalesce(max((regexp_match(code, '^BC(\d+)$'))[1]::int), 0) + 1
  into v_next
  from public.bons_commande_matiere_premiere;

  execute format('create sequence if not exists public.bons_commande_mp_code_seq start with %s', v_next);
end $$;

create or replace function public.stock_bc_mp_create_batch(p_lignes jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_code text;
begin
  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucun article a enregistrer.';
  end if;

  v_code := 'BC' || nextval('public.bons_commande_mp_code_seq')::text;

  insert into public.bons_commande_matiere_premiere (
    code, article_id, article_label, quantite, n_doss_4d, n_doss_erp
  )
  select
    v_code,
    nullif(elem->>'article_id', '')::bigint,
    elem->>'article_label',
    (elem->>'quantite')::numeric,
    nullif(elem->>'n_doss_4d', ''),
    nullif(elem->>'n_doss_erp', '')
  from jsonb_array_elements(p_lignes) as elem;

  return jsonb_build_object('code', v_code);
end;
$$;

revoke all on function public.stock_bc_mp_create_batch(jsonb) from public;
grant execute on function public.stock_bc_mp_create_batch(jsonb) to service_role;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_dispatcher_code_unique.sql
-- ------------------------------------------------------------
-- Un code de lot ("code" sur programme_dispatcher_lignes, ex: AA1111) doit
-- toujours identifier un seul lot physique. Sans contrainte, deux "Save"
-- lances a quelques millisecondes d'ecart sur la meme famille d'articles
-- pouvaient tous les deux calculer le meme prochain code et l'inserer
-- silencieusement en double - meme code sur deux lots physiques differents,
-- une vraie erreur de tracabilite en production.
--
-- Index unique partiel (code is not null) plutot qu'une contrainte simple :
-- certaines lignes dispatcher peuvent avoir code = null (aucun code
-- exploitable trouve dans la famille, voir generateAutoCodes), et Postgres
-- traite deja NULL comme distinct de tout autre NULL dans un index unique
-- standard - la clause "where code is not null" est seulement la pour
-- documenter explicitement l'intention.
create unique index if not exists programme_dispatcher_lignes_code_unique_idx
  on public.programme_dispatcher_lignes (code)
  where code is not null;

-- ------------------------------------------------------------
-- scripts/sql/add_stock_mp_lot_balances_rpc.sql
-- ------------------------------------------------------------
-- La page Sortie MP est devenue lente (~12s) depuis l'ajout du picker de
-- lot existant : elle rapatriait TOUTE la table lots_stock_matiere_premiere
-- (dizaines de milliers de lignes, dont l'import historique de 39.5k) page
-- par page pour calculer le solde par article+lot cote Node. Cette fonction
-- fait le meme calcul (somme qte_entree - qte_sortie, groupe par
-- article+lot, ne garde que le solde positif) directement en base, en une
-- seule requete.
create or replace function public.stock_mp_lot_balances()
returns table(article_id bigint, numero_lot text, stock numeric)
language sql
stable
as $$
  select
    article_id,
    max(numero_lot) as numero_lot,
    sum(qte_entree) - sum(qte_sortie) as stock
  from public.lots_stock_matiere_premiere
  where article_id is not null and numero_lot is not null and numero_lot <> ''
  group by article_id, upper(trim(numero_lot))
  having sum(qte_entree) - sum(qte_sortie) > 0;
$$;

revoke all on function public.stock_mp_lot_balances() from public;
grant execute on function public.stock_mp_lot_balances() to service_role;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_lignes_next_group_number_rpc.sql
-- ------------------------------------------------------------
-- "Programme par ligne" / Save devient tres lent (et peut carrement planter
-- - "An error occurred in the Server Components render...") a mesure que
-- programme_lignes grossit (6252+ lignes) : le calcul du prochain numero
-- MB<n> rapatriait TOUTE la table (colonne groupe_id) page par page rien
-- que pour compter les groupes distincts. Meme calcul, fait en base en une
-- seule requete.
create or replace function public.programme_lignes_next_group_number()
returns bigint
language sql
stable
as $$
  select count(distinct groupe_id) + 1 from public.programme_lignes;
$$;

revoke all on function public.programme_lignes_next_group_number() from public;
grant execute on function public.programme_lignes_next_group_number() to service_role;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_ligne_bulk_write_rpcs.sql
-- ------------------------------------------------------------
-- Le Save de "Programme par ligne" (et "Relancer" depuis Historique
-- programme) restait lent - voire plantait avec une erreur serveur/reseau -
-- sur les gros programmes (beaucoup de chaines/articles) : meme limitees a
-- 5 a la fois, les ecritures groupees (suppression dispatcher par zone/
-- chaine, mise a jour numero_lot par ligne, mise a jour code par article)
-- faisaient encore plusieurs vagues d'allers-retours reseau sequentielles,
-- assez pour depasser le temps limite de la fonction serverless sur un gros
-- relance. Ces 3 RPC font chacune tout leur travail en UNE seule requete
-- (boucle cote base, pas cote reseau).
create or replace function public.programme_dispatcher_clear_zones(p_pairs jsonb)
returns void
language plpgsql
as $$
declare
  v_pair jsonb;
begin
  for v_pair in select * from jsonb_array_elements(p_pairs)
  loop
    delete from public.programme_dispatcher_lignes
    where zone = (v_pair->>'zone')
      and chaine = (v_pair->>'chaine');
  end loop;
end;
$$;

create or replace function public.programme_lignes_bulk_update_numero_lot(p_updates jsonb)
returns void
language plpgsql
as $$
declare
  v_update jsonb;
begin
  for v_update in select * from jsonb_array_elements(p_updates)
  loop
    update public.programme_lignes
    set numero_lot = (v_update->>'numero_lot')
    where id = (v_update->>'id')::bigint;
  end loop;
end;
$$;

create or replace function public.articles_bulk_update_codes(p_updates jsonb)
returns void
language plpgsql
as $$
declare
  v_update jsonb;
begin
  for v_update in select * from jsonb_array_elements(p_updates)
  loop
    update public.articles
    set
      code_manu = coalesce(v_update->>'code_manu', code_manu),
      code_auto = coalesce(v_update->>'code_auto', code_auto)
    where id = (v_update->>'id')::bigint;
  end loop;
end;
$$;

revoke all on function public.programme_dispatcher_clear_zones(jsonb) from public;
revoke all on function public.programme_lignes_bulk_update_numero_lot(jsonb) from public;
revoke all on function public.articles_bulk_update_codes(jsonb) from public;
grant execute on function public.programme_dispatcher_clear_zones(jsonb) to service_role;
grant execute on function public.programme_lignes_bulk_update_numero_lot(jsonb) to service_role;
grant execute on function public.articles_bulk_update_codes(jsonb) to service_role;

-- ------------------------------------------------------------
-- scripts/sql/fix_programme_dispatcher_code_unique_allow_shared.sql
-- ------------------------------------------------------------
-- L'index unique sur "code" seul (add_programme_dispatcher_code_unique.sql)
-- entre en conflit avec une fonctionnalite demandee explicitement par
-- l'utilisateur : quand le vrac combine de 2 chaines pour le meme article
-- depasse le max autorise, le lot excedentaire est reparti sur les 2
-- chaines et DOIT porter le MEME code (ex: 4500 sur chaine 1 + 4500 sur
-- chaine 2, max 3000 -> le "1500" de chaine 1 et le "1500" de chaine 2
-- forment ensemble un 3eme lot de 3000, un seul code partage sur les 2
-- lignes dispatcher). Avec l'index sur "code" seul, ce cas provoquait
-- systematiquement "duplicate key value violates unique constraint" - ce
-- n'etait pas une vraie collision accidentelle, c'etait la fonctionnalite
-- elle-meme qui violait la contrainte a chaque fois.
--
-- Remplace par un index unique compose sur (code, zone, chaine) : autorise
-- le meme code sur 2 chaines differentes (le cas voulu ci-dessus), tout en
-- bloquant toujours un vrai doublon exact (meme code, meme zone, meme
-- chaine), qui resterait une erreur de tracabilite.
drop index if exists public.programme_dispatcher_lignes_code_unique_idx;

create unique index if not exists programme_dispatcher_lignes_code_zone_chaine_unique_idx
  on public.programme_dispatcher_lignes (code, zone, chaine)
  where code is not null;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_lignes_next_group_number_per_year.sql
-- ------------------------------------------------------------
-- Remplace programme_lignes_next_group_number_rpc.sql : le code affiche
-- passe de MB<n> (numero global, jamais remis a zero) a PL<n>.<annee> (ex:
-- PL1.2026), avec le numero qui repart a 1 a chaque nouvelle annee - il
-- faut donc compter les groupes distincts filtres sur l'annee de date_jour,
-- pas sur toute la table.
create or replace function public.programme_lignes_next_group_number_for_year(p_year int)
returns bigint
language sql
stable
as $$
  select count(distinct groupe_id) + 1
  from public.programme_lignes
  where extract(year from date_jour) = p_year;
$$;

revoke all on function public.programme_lignes_next_group_number_for_year(int) from public;
grant execute on function public.programme_lignes_next_group_number_for_year(int) to service_role;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_lignes_numero_lot_detail.sql
-- ------------------------------------------------------------
-- Le Dashboard Production (splitLigneIntoDisplayRows) reconstituait la
-- repartition qt_vrac/qt_carton par code d'une ligne multi-lots ("AB1044,
-- AB1046") en allant chercher les lots correspondants dans
-- programme_dispatcher_lignes - mais cette table est un instantane de la
-- production EN COURS, videe et reecrite a chaque nouveau Save touchant la
-- meme (zone, chaine), meme pour une toute autre ligne/date. Des qu'un
-- Save ulterieur touchait la meme chaine, l'ancienne ligne perdait sa
-- repartition par lot et retombait sur l'affichage combine "AB1044,
-- AB1046" au lieu d'une ligne par code. Cette colonne fige la repartition
-- au moment du Save (jamais modifiee ensuite), independamment de ce que
-- devient le Dispatcher.
alter table public.programme_lignes
  add column if not exists numero_lot_detail jsonb;

create or replace function public.programme_lignes_bulk_update_numero_lot(p_updates jsonb)
returns void
language plpgsql
as $$
declare
  v_update jsonb;
begin
  for v_update in select * from jsonb_array_elements(p_updates)
  loop
    update public.programme_lignes
    set numero_lot = (v_update->>'numero_lot'),
        numero_lot_detail = (v_update->'numero_lot_detail')
    where id = (v_update->>'id')::bigint;
  end loop;
end;
$$;

revoke all on function public.programme_lignes_bulk_update_numero_lot(jsonb) from public;
grant execute on function public.programme_lignes_bulk_update_numero_lot(jsonb) to service_role;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_lignes_confirme_production.sql
-- ------------------------------------------------------------
-- Un programme enregistre depuis "Programme par ligne" doit d'abord etre
-- visible/ajustable sur "Ravitailleur par ligne" AVANT d'apparaitre sur le
-- Dashboard Production et le Calendrier - seul le bouton "Save" sur
-- Ravitailleur (par zone ou "Toutes les zones", qui genere le code PD dans
-- Historique Programme Dispatcher) confirme officiellement le programme
-- pour le suivi de production.
--
-- Defaut a TRUE (pas FALSE) : toutes les lignes DEJA en base (creees avant
-- cette colonne, potentiellement deja suivies en production - rapports
-- Fabrication/Conditionnement/Emballage en cours) doivent rester visibles
-- exactement comme avant, sans regression. C'est le code applicatif
-- (performProgrammeLigneSave) qui met explicitement FALSE sur les
-- NOUVELLES lignes desormais - le nouveau flux en 2 etapes ne s'applique
-- donc qu'aux programmes crees a partir de maintenant.
alter table public.programme_lignes
  add column if not exists confirme_production boolean not null default true;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_dispatcher_history_source_groupe_id.sql
-- ------------------------------------------------------------
-- deleteProgrammeDispatcherHistoryGroupAction retrouve les lignes
-- programme_lignes a marquer "termine" en matchant les codes du PD
-- supprime contre numero_lot - mais une ligne dont l'article n'a pas de
-- code_manu/code_auto configure n'a JAMAIS de code (numero_lot reste NULL),
-- donc ne peut jamais etre retrouvee par ce matching et resterait
-- indefiniment visible sur le Dashboard meme apres suppression de son PD.
-- Cette colonne garde le groupe_id du programme SOURCE (programme_lignes)
-- au moment du Save Ravitailleur, pour pouvoir aussi marquer "termine" par
-- groupe entier (en plus du matching par code), qui couvre ce cas.
alter table public.programme_dispatcher_history
  add column if not exists source_groupe_id bigint;

-- ------------------------------------------------------------
-- scripts/sql/add_production_rapports_arrets_fabrication.sql
-- ------------------------------------------------------------
-- Ajoute les causes d'arret specifiques a la Fabrication (aucune n'existait
-- avant - seul Conditionnement et Emballage avaient des causes d'arret) -
-- meme principe que les colonnes emballage_arret_* : minutes d'arret par
-- cause, saisies sur le rapport Fabrication.
alter table public.production_rapports
  add column if not exists fabrication_arret_absence_air numeric,
  add column if not exists fabrication_arret_absence_vapeur numeric,
  add column if not exists fabrication_arret_attente_aspiration_aqueuse numeric,
  add column if not exists fabrication_arret_attente_cuves_mobiles numeric,
  add column if not exists fabrication_arret_attente_eau_osmosee numeric,
  add column if not exists fabrication_arret_coupure_electrique numeric,
  add column if not exists fabrication_arret_maintenance_plateforme numeric,
  add column if not exists fabrication_arret_manque_cuves_mobiles numeric,
  add column if not exists fabrication_arret_probleme_pompe numeric,
  add column if not exists fabrication_arret_probleme_ph numeric,
  add column if not exists fabrication_arret_probleme_technique numeric;

-- ------------------------------------------------------------
-- scripts/sql/add_production_rapports_date_emballage.sql
-- ------------------------------------------------------------
-- "Date fabrication"/"Date conditionnement"/"Date emballage" affichees dans
-- Suivi Production venaient jusqu'ici de la date AUTOMATIQUE (today, valeur
-- par defaut) de production_vrac_entries/production_carton_entries/
-- production_emballage_entries.date_jour, jamais choisie a la main.
-- date_fabrication_conditionnement existe deja (utilisee par le rapport
-- Conditionnement) et sera desormais aussi saisie sur le rapport
-- Fabrication (meme champ, partage entre les 2 comme son nom l'indique) -
-- cette colonne ajoute l'equivalent pour Emballage, qui n'en avait aucune.
alter table public.production_rapports
  add column if not exists date_emballage date;

-- ------------------------------------------------------------
-- scripts/sql/add_dashboard_perf_indexes.sql
-- ------------------------------------------------------------
-- Chaque clic sur "Fin programme" (ou toute autre action Dashboard) revient
-- sur /production/suivi/dashboard, qui refait sa requete principale sur
-- programme_lignes (deja 6000+ lignes et ca grossit) filtree par
-- confirme_production/programme_termine et triee par date_jour/created_at -
-- sans index correspondant, Postgres doit scanner toute la table a chaque
-- fois. Meme chose pour les 3 tables d'entrees (vrac/carton/emballage),
-- filtrees par programme_ligne_id a chaque chargement du Dashboard.
create index if not exists idx_programme_lignes_dashboard
  on public.programme_lignes (confirme_production, programme_termine, date_jour desc, created_at desc);

create index if not exists idx_production_vrac_entries_ligne
  on public.production_vrac_entries (programme_ligne_id);

create index if not exists idx_production_carton_entries_ligne
  on public.production_carton_entries (programme_ligne_id);

create index if not exists idx_production_emballage_entries_ligne
  on public.production_emballage_entries (programme_ligne_id);

create index if not exists idx_production_rapports_ligne
  on public.production_rapports (programme_ligne_id);

-- ------------------------------------------------------------
-- scripts/sql/add_programme_dispatcher_code_unique_include_article.sql
-- ------------------------------------------------------------
-- L'index unique sur (code, zone, chaine) forcait 2 contenances DIFFERENTES
-- de la meme famille (ex: 750ml + 400ml) partageant le meme code et tombant
-- sur la meme chaine a etre fusionnees en une seule ligne Dispatcher (voir
-- app/programe-par-ligne/actions.ts) - leurs Qt Carton (calculees chacune
-- avec leur propre nombre de pieces par carton) etaient additionnees et
-- leurs noms concatenes avec "+", ce qui donne un total de cartons
-- inexploitable pour l'emballage (2 contenances differentes ne se
-- conditionnent pas dans le meme type de carton).
--
-- Remplace par un index unique compose sur (code, zone, chaine, article_id) :
-- autorise 2 contenances differentes (article_id different) a coexister sur
-- (code, zone, chaine), tout en bloquant toujours un vrai doublon exact
-- (meme code, meme zone, meme chaine, meme article), qui resterait une
-- erreur de tracabilite.
drop index if exists public.programme_dispatcher_lignes_code_zone_chaine_unique_idx;

create unique index if not exists programme_dispatcher_lignes_code_zone_chaine_article_unique_idx
  on public.programme_dispatcher_lignes (code, zone, chaine, article_id)
  where code is not null;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_lignes_remarque.sql
-- ------------------------------------------------------------
alter table public.programme_lignes add column if not exists remarque text;

-- ------------------------------------------------------------
-- scripts/sql/add_production_code_columns.sql
-- ------------------------------------------------------------
-- Une ligne "Programme par ligne" decoupee en plusieurs lots (voir
-- buildDispatcherDraftRows) donnait plusieurs codes (ex: 9000 -> 3x3000)
-- MAIS un seul rapport de production par ligne (production_rapports.
-- programme_ligne_id unique) - Conditionnement/Emballage saisis pour UN
-- code s'appliquaient donc a tort aux 2 autres codes de la meme ligne
-- (meme rapport partage, mêmes journaux carton/emballage), y compris le
-- passage automatique a l'etape suivante (Emballage) qui se declenchait
-- pour les 3 codes au lieu d'un seul.
--
-- Ajoute une colonne "code" (defaut '' = comportement historique/partage,
-- utilise tel quel par Fabrication qui reste au niveau de la ligne
-- entiere - le vrac est fabrique en un seul bloc avant d'etre reparti en
-- lots). Conditionnement/Emballage utilisent desormais le vrai code du
-- lot, jamais '' pour une nouvelle saisie.
alter table public.production_rapports add column if not exists code text not null default '';
alter table public.production_carton_entries add column if not exists code text not null default '';
alter table public.production_vrac_entries add column if not exists code text not null default '';
alter table public.production_emballage_entries add column if not exists code text not null default '';

alter table public.production_rapports drop constraint if exists production_rapports_ligne_unique;
alter table public.production_rapports
  add constraint production_rapports_ligne_code_unique unique (programme_ligne_id, code);

-- ------------------------------------------------------------
-- scripts/sql/add_fifo_resultats_preparateur.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- scripts/sql/create_pending_article_code_updates.sql
-- ------------------------------------------------------------
-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Jusqu'ici, le code d'un article (articles.code_manu/code_auto, visible
-- sur "Code par article") se mettait a jour des le Dispatch sur Programme
-- par ligne - avant meme que ce dispatch soit confirme sur Ravitailleur. Si
-- ce dispatch etait ensuite abandonne/refait, le "dernier code" affiche sur
-- l'article restait quand meme avance, ce qui n'est pas voulu.
--
-- Cette table garde le nouveau code de chaque article "en attente" au
-- moment du Dispatch (voir assignDispatcherCodesAndInsert), et n'est
-- appliquee sur articles.code_manu/code_auto qu'au moment ou le Save de
-- Ravitailleur confirme officiellement le programme (voir
-- saveProgrammeDispatcherSnapshotAction / saveAllZonesDispatcherSnapshotAction),
-- qui vide ensuite les lignes consommees.
create table if not exists public.pending_article_code_updates (
  id bigserial primary key,
  groupe_id bigint not null,
  article_id bigint not null references public.articles(id),
  code_manu text,
  code_auto text,
  created_at timestamptz not null default now(),
  unique (groupe_id, article_id)
);

create index if not exists pending_article_code_updates_groupe_id_idx
  on public.pending_article_code_updates (groupe_id);

-- ------------------------------------------------------------
-- scripts/sql/create_production_code_termine.sql
-- ------------------------------------------------------------
-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- "Fin programme" (Terminer) sur le Dashboard etait au niveau de la ligne
-- entiere (programme_lignes.vrac_termine/carton_termine/emballage_termine)
-- - sur une ligne decoupee en plusieurs codes (numero_lot = "AA1, AA2,
-- AA3"), Terminer UN SEUL code cachait donc a tort les 2 autres du
-- Dashboard (meme bug de fond que le suivi par code des rapports,
-- corrige plus tot). Cette table garde desormais quel(s) code(s) precis
-- ont ete termines, etape par etape.
create table if not exists public.production_code_termine (
  id bigserial primary key,
  programme_ligne_id bigint not null references public.programme_lignes(id),
  code text not null,
  stage text not null check (stage in ('vrac', 'carton', 'emballage')),
  termine_date timestamptz not null default now(),
  unique (programme_ligne_id, code, stage)
);

create index if not exists production_code_termine_ligne_idx
  on public.production_code_termine (programme_ligne_id);

