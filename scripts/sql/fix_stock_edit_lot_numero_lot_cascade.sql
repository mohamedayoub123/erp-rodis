-- Bug reel signale : modifier le "Numero de lot" sur une ligne stock PF
-- plantait (page d'erreur generique) des que ce numero de lot avait d'autres
-- mouvements (entree/sortie) enregistres sous le meme numero - stock_edit_lot
-- ne renommait QUE la ligne editee (where id = p_lot_id), laissant les autres
-- lignes du meme lot physique sur l'ancien numero : le lot se retrouvait
-- coupe en deux groupes differents, ce qui a fait planter le calcul de solde
-- en aval. Demande explicite : renommer un numero de lot doit mettre a jour
-- AUTOMATIQUEMENT tous les mouvements de ce meme lot, pas juste la ligne
-- ouverte.
--
-- Redepose stock_edit_lot (remplace la version de stock_locking_functions.sql,
-- RIEN d'autre ne change) : quand p_numero_lot differe du numero actuel de la
-- ligne, le renommage (numero_lot + code_normalise) s'applique desormais a
-- TOUTES les lignes du meme article qui partagent l'ancien numero de lot,
-- pas seulement p_lot_id. Les champs propres a CETTE ligne (date
-- fabrication/quantites/chambre/pays/note) restent modifies uniquement sur
-- p_lot_id, jamais propages aux autres lignes.
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
  v_ancien_numero_lot text;
begin
  select article_id, numero_lot into v_article_id, v_ancien_numero_lot
  from public.lots_stock
  where id = p_lot_id;

  if v_article_id is null then
    raise exception 'Ligne stock invalide.';
  end if;

  perform public._lock_articles_for_stock(array[v_article_id]);

  perform 1 from public.lots_stock where article_id = v_article_id for update;

  if p_numero_lot is distinct from v_ancien_numero_lot then
    update public.lots_stock
    set numero_lot = p_numero_lot,
        code_normalise = upper(p_numero_lot)
    where article_id = v_article_id
      and upper(trim(coalesce(numero_lot, ''))) = upper(trim(coalesce(v_ancien_numero_lot, '')));
  end if;

  update public.lots_stock
  set
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
