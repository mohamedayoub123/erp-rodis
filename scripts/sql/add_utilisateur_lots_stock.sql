-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Ajoute la tracabilite "saisi par" sur les mouvements Produit Fini (lots_stock),
-- meme principe que lots_stock_matiere_premiere.utilisateur.

alter table public.lots_stock add column if not exists utilisateur text;

-- stock_record_sortie_batch : ajoute utilisateur a l'insert. p_lignes accepte
-- desormais un champ optionnel "utilisateur" par ligne (ignore si absent).
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
  v_utilisateur text;
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
    v_utilisateur := nullif(v_ligne->>'utilisateur', '');

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

    v_lot_key := v_article_id::text || '::' || upper(trim(v_code_normalise));

    select coalesce(sum(qte_entree - qte_sortie), 0)
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
      qte_entree, qte_sortie, chambre, code_pays, source_import, note, utilisateur
    ) values (
      v_article_id, current_date, v_numero_lot, upper(trim(v_code_normalise)), v_date_fabrication,
      0, v_quantite, v_chambre, v_code_pays, 'web:sortie', nullif(v_meta_line, ''), v_utilisateur
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
