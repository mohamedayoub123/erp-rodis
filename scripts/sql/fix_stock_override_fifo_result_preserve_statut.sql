-- A coller dans Supabase Dashboard > SQL Editor > New query, puis ecrire "SQL OK" dans le chat de Claude (pas dans ce fichier).
--
-- PROBLEME : une commande mise en "BL transforme" repassait toute seule a "En cours" quand David modifiait le dispatch
-- (changer un lot, une quantite ou le preparateur, puis "Enregistrer"). Cause trouvee : la fonction stock_override_fifo_result
-- (appelee par ces enregistrements) ecrivait TOUJOURS le statut FIFO_PARTIEL / FIFO_CALCULE ("En cours") et posait la date
-- "entree en cours", sans regarder le statut actuel. Le bouton "Despatcher" (stock_run_fifo) protegeait deja BL transforme /
-- Stand / Livree, mais pas cette fonction-la.
--
-- CORRECTIF : meme regle que stock_run_fifo. Le statut n'est mis a jour (FIFO_PARTIEL / FIFO_CALCULE) QUE si la commande est
-- deja "En cours". Une commande Stand, BL transforme ou Livree GARDE son statut, et la date "entree en cours" n'est plus
-- posee pour elle. Le reste de la fonction (verifications du stock, lots, reservations, manque par ligne) est inchange.
--
-- REMISE EN ORDRE : les 4 commandes deja touchees (3985, 3985-2, 3995, 3998) repassent a "BL transforme", et les dates
-- "en cours" posees par erreur le 12 et le 13/10/2026 sont retirees de leur commentaire. Leur dispatch (lots reserves) n'est pas
-- modifie. Une sauvegarde de leur ancien statut et commentaire est gardee dans la table sauvegarde_correctifs_donnees.

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
  v_final_statut text;
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

  -- Meme regle que stock_run_fifo : seule une commande deja "En cours" prend le statut technique FIFO_*. Stand, BL transforme
  -- et Livree gardent LEUR statut (un dispatch ne doit jamais le changer).
  v_final_statut := case
    when public._statut_bucket(v_statut) = 'EN_COURS' then v_next_statut
    else coalesce(nullif(v_statut, ''), v_next_statut)
  end;

  v_next_commentaire := public._upsert_comment_token(v_commentaire, 'PREPARATEUR_COMMANDE:', p_preparateur);

  -- Ne pose la date "entree en cours" que pour une commande En cours, et seulement la premiere fois (token absent) -
  -- jamais pour une commande BL transforme / Stand / Livree, et jamais reecrasee a chaque Enregistrer.
  if public._statut_bucket(v_statut) = 'EN_COURS'
     and public._extract_comment_token(v_commentaire, 'STATUT_DATE_EN_COURS:') = '' then
    v_next_commentaire := public._upsert_comment_token(v_next_commentaire, 'STATUT_DATE_EN_COURS:', to_char(current_date, 'YYYY-MM-DD'));
    v_next_commentaire := public._upsert_comment_token(v_next_commentaire, 'DATE_TRANSITION_STAND_ENCOURS:', to_char(current_date, 'YYYY-MM-DD'));
  end if;

  update public.commandes
  set commentaire = v_next_commentaire, statut = v_final_statut
  where id = p_commande_id;

  return jsonb_build_object('commande_id', p_commande_id, 'statut', v_final_statut, 'total_shortage', v_total_shortage);
end;
$$;

revoke all on function public.stock_override_fifo_result(bigint, bigint, text, text, numeric) from public;
grant execute on function public.stock_override_fifo_result(bigint, bigint, text, text, numeric) to service_role;

-- Remise en ordre des 4 commandes deja repassees a "En cours" par erreur
create table if not exists public.sauvegarde_correctifs_donnees (
  id bigserial primary key,
  date_correctif timestamptz not null default now(),
  description text,
  donnees jsonb not null
);
alter table public.sauvegarde_correctifs_donnees enable row level security;

insert into public.sauvegarde_correctifs_donnees (description, donnees)
select
  'Commandes BL transforme repassees a En cours par stock_override_fifo_result - etat avant remise en BL transforme',
  coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'numero_proforma', c.numero_proforma, 'statut', c.statut, 'commentaire', c.commentaire)), '[]'::jsonb)
from public.commandes c
where c.id in (320, 321, 327, 330)
  and c.statut in ('FIFO_PARTIEL', 'FIFO_CALCULE')
  and c.commentaire like '%STATUT_DATE_BL_TRANSFORME:%';

update public.commandes
set
  statut = 'BL_TRANSFORME',
  commentaire = regexp_replace(
    commentaire,
    '(\s*\|\s*)?(STATUT_DATE_EN_COURS|DATE_TRANSITION_STAND_ENCOURS):[0-9]{4}-[0-9]{2}-[0-9]{2}',
    '',
    'g'
  )
where id in (320, 321, 327, 330)
  and statut in ('FIFO_PARTIEL', 'FIFO_CALCULE')
  and commentaire like '%STATUT_DATE_BL_TRANSFORME:%';

-- Verification : les 4 commandes doivent etre en BL_TRANSFORME
select id, numero_proforma, client, statut from public.commandes where id in (320, 321, 327, 330) order by id;
