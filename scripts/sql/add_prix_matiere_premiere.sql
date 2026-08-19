-- Integration des prix MP : prix unitaire negocie sur le BC, prix unitaire
-- reel copie sur la ligne de stock a la Reception.
alter table bons_commande_matiere_premiere
  add column if not exists prix_unitaire numeric;

alter table lots_stock_matiere_premiere
  add column if not exists prix_unitaire numeric;

drop function if exists public.stock_bc_mp_create_batch(jsonb, date);

create or replace function public.stock_bc_mp_create_batch(p_lignes jsonb, p_date_jour date default null)
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
    code, article_id, article_label, quantite, prix_unitaire, n_doss_4d, n_doss_erp, fournisseur, date_jour
  )
  select
    v_code,
    nullif(elem->>'article_id', '')::bigint,
    elem->>'article_label',
    (elem->>'quantite')::numeric,
    nullif(elem->>'prix_unitaire', '')::numeric,
    nullif(elem->>'n_doss_4d', ''),
    nullif(elem->>'n_doss_erp', ''),
    nullif(elem->>'fournisseur', ''),
    coalesce(p_date_jour, current_date)
  from jsonb_array_elements(p_lignes) as elem;

  return jsonb_build_object('code', v_code);
end;
$$;

revoke all on function public.stock_bc_mp_create_batch(jsonb, date) from public;
grant execute on function public.stock_bc_mp_create_batch(jsonb, date) to service_role;
