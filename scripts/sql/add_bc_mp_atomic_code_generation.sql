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
