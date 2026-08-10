-- ============================================================
-- SYNC V2 (dev) sur V1 (prod) - a coller dans Supabase Dashboard
-- (projet V2 / dev) > SQL Editor > New query, puis Run.
--
-- Suite de scripts/sql/sync_v2_2026-08-07.sql : tout ce qui a ete ajoute a
-- V1 depuis ce dernier sync (2026-08-07 12:07 UTC) et qui manque encore
-- dans V2. Chaque section = un des scripts dans scripts/sql/, dans l'ordre
-- ou ils ont ete appliques a V1. Tout est ecrit en "if not exists" /
-- "create or replace" - sans risque de rejouer une section deja passee.
-- ============================================================

-- ------------------------------------------------------------
-- scripts/sql/add_sortie_remarque.sql
-- ------------------------------------------------------------
-- Ajoute une remarque libre sur une sortie manuelle (page /mouvements/sortie),
-- stockee comme 8eme segment de la meme ligne meta que code/livre pour/BL/
-- preparateur/quantite (voir _build_commande_sortie_meta_line). Le nouveau
-- parametre a une valeur par defaut : les appels existants (ex:
-- stock_deliver_commande, qui n'a pas de remarque) continuent de marcher
-- sans modification.
create or replace function public._build_commande_sortie_meta_line(
  p_code text,
  p_livre_pour text,
  p_numero_bl text,
  p_preparateur text,
  p_quantite numeric,
  p_remarque text default ''
)
returns text
language plpgsql
as $$
declare
  v_code text := public._sanitize_meta_value(p_code);
  v_client text := public._sanitize_meta_value(p_livre_pour);
  v_bl text := public._sanitize_meta_value(p_numero_bl);
  v_prep text := public._sanitize_meta_value(p_preparateur);
  v_remarque text := public._sanitize_meta_value(p_remarque);
  v_qty_text text;
begin
  if v_code = '' and v_client = '' and v_bl = '' and v_prep = '' and v_remarque = '' then
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
    || v_qty_text || '|'
    || coalesce(nullif(v_remarque, ''), '-');
end;
$$;

revoke all on function public._build_commande_sortie_meta_line(text, text, text, text, numeric, text) from public;

-- stock_record_sortie_batch (page /mouvements/sortie) lit maintenant
-- "remarque" dans chaque ligne recue et la transmet.
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
  v_remarque text;
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
    v_remarque := coalesce(v_ligne->>'remarque', '');

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

    v_meta_line := public._build_commande_sortie_meta_line(
      v_code, v_livre_pour, v_numero_bl, v_preparateur, v_quantite, v_remarque
    );

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

  return jsonb_build_object('groupe_id', v_group_id, 'lignes', array_length(v_new_ids, 1));
end;
$$;

revoke all on function public.stock_record_sortie_batch(jsonb) from public;
grant execute on function public.stock_record_sortie_batch(jsonb) to service_role;

-- ------------------------------------------------------------
-- scripts/sql/add_bc_mp_fournisseur_date.sql
-- ------------------------------------------------------------
-- Ajoute un fournisseur par ligne de commande MP, et permet de fixer la
-- date de la commande (date_jour) a l'enregistrement - jusqu'ici jamais
-- passee a stock_bc_mp_create_batch, donc toujours NULL.
alter table public.bons_commande_matiere_premiere
  add column if not exists fournisseur text;

drop function if exists public.stock_bc_mp_create_batch(jsonb);

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
    code, article_id, article_label, quantite, n_doss_4d, n_doss_erp, fournisseur, date_jour
  )
  select
    v_code,
    nullif(elem->>'article_id', '')::bigint,
    elem->>'article_label',
    (elem->>'quantite')::numeric,
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

-- ------------------------------------------------------------
-- scripts/sql/add_dechet_etui.sql
-- ------------------------------------------------------------
-- Ajoute le dechet "Etui" a Conditionnement, comme Sleeve/Capsule/Pompe/
-- Flacon/Pot/Etiquette deja suivis (articles.besoin_etui existe deja pour
-- indiquer qu'un article a besoin d'etui, mais rien ne suivait son dechet).
alter table public.production_rapports
  add column if not exists dechet_etui numeric;

-- ------------------------------------------------------------
-- scripts/sql/add_degre_alcool.sql
-- ------------------------------------------------------------
-- Ajoute le degre d'alcool au controle qualite de Fabrication (test labo),
-- a cote de pH/Densite/Viscosite/Stabilite deja suivis.
alter table public.production_rapports
  add column if not exists degre_alcool numeric;

-- ------------------------------------------------------------
-- scripts/sql/add_nb_journaliers.sql
-- ------------------------------------------------------------
-- Ajoute le nombre de journaliers (ouvriers payes a la journee) sur ce
-- poste, dans la section Equipe de Conditionnement et Emballage - 2
-- colonnes separees (comme le reste, une par etape) puisque
-- production_rapports partage la meme ligne entre Fabrication/
-- Conditionnement/Emballage pour un meme (programme_ligne_id, code).
alter table public.production_rapports
  add column if not exists nb_journaliers_conditionnement numeric,
  add column if not exists nb_journaliers_emballage numeric;

-- Emballage n'avait pas de "Chef de zone" (Conditionnement seul l'avait) -
-- colonne separee (emballage_chef_zone) pour ne pas ecraser celle de
-- Conditionnement, qui partage la meme ligne production_rapports pour ce
-- (programme_ligne_id, code).
alter table public.production_rapports
  add column if not exists emballage_chef_zone text;

-- ------------------------------------------------------------
-- scripts/sql/add_utilisation_article_mp.sql
-- ------------------------------------------------------------
-- Ajoute un champ texte libre "Utilisation" sur les articles matiere
-- premiere (ex: "emballage gel douche", "bouchon flacon 500ml").
alter table public.articles_matiere_premiere
  add column if not exists utilisation text;

-- ------------------------------------------------------------
-- scripts/sql/add_gamme_statistique.sql
-- ------------------------------------------------------------
alter table articles_matiere_premiere
  add column if not exists gamme_statistique text;

-- ------------------------------------------------------------
-- scripts/sql/add_recettes_pf.sql
-- ------------------------------------------------------------
-- Distingue les articles PF "vrac" (sortie de Fabrication) des articles PF
-- normaux/finis (sortie de Conditionnement). "type_article" existe deja et
-- sert a autre chose (parfume/hydratant/gel douche...), d'ou un nouveau nom.
alter table articles
  add column if not exists nature text not null default 'fini';

-- Formule (BOM) : pour un article PF (vrac ou fini), la liste des articles
-- MP qui le composent avec leur quantite. Une seule table pour les deux
-- recettes (fabrication et conditionnement) - la nature de l'article PF
-- (vrac/fini) determine sur quelle page la recette apparait.
create table if not exists recettes_pf (
  id bigint generated always as identity primary key,
  article_pf_id bigint not null references articles(id) on delete cascade,
  article_mp_id bigint not null references articles_matiere_premiere(id) on delete cascade,
  quantite numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (article_pf_id, article_mp_id)
);

create index if not exists recettes_pf_article_pf_id_idx on recettes_pf(article_pf_id);

-- ------------------------------------------------------------
-- scripts/sql/add_quantite_recette_base.sql
-- ------------------------------------------------------------
-- Taille du lot pour lequel une recette est calibree : kg de vrac produit
-- (Fabrication) ou nombre de cartons produits (Conditionnement). Sert de
-- reference pour convertir chaque ligne MP entre quantite et %.
alter table articles
  add column if not exists quantite_recette_base numeric;

-- ------------------------------------------------------------
-- scripts/sql/add_vrac_article_id.sql
-- ------------------------------------------------------------
-- Pour un article PF fini (nature='fini'), quel vrac (article PF nature='vrac')
-- est utilise pour le conditionner. Sert a la recette Conditionnement et a
-- la future page Programme (choisir l'article fini -> retrouve directement
-- son vrac).
alter table articles
  add column if not exists vrac_article_id bigint references articles(id);

-- ------------------------------------------------------------
-- scripts/sql/create_programmes.sql
-- ------------------------------------------------------------
-- Nouvelle page "Programme" (separee de Programme par ligne existant) :
-- article fini + machine Fabrication + machine Conditionnement + qt carton
-- + qt vrac, avec qt carton/vrac calcules automatiquement a partir de la
-- capacite des machines (table machine_produits deja existante) et
-- modifiables a la main.
create table if not exists programmes (
  id bigint generated always as identity primary key,
  article_id bigint not null references articles(id),
  vrac_article_id bigint references articles(id),
  machine_fabrication_id bigint references machines(id),
  machine_conditionnement_id bigint references machines(id),
  duree_minutes numeric,
  qt_carton numeric not null default 0,
  qt_vrac numeric not null default 0,
  date_jour date not null default current_date,
  utilisateur text,
  created_at timestamptz not null default now()
);

create index if not exists programmes_date_jour_idx on programmes(date_jour);
create index if not exists programmes_article_id_idx on programmes(article_id);

-- ------------------------------------------------------------
-- scripts/sql/add_programme_emballage.sql
-- ------------------------------------------------------------
-- Colonnes ajoutees a V1 puis laissees inutilisees cote app (le champ
-- Emballage a ete retire de la page Programme) - conservees ici pour que le
-- schema V2 corresponde exactement a V1.
alter table programmes
  add column if not exists machine_emballage_id bigint references machines(id),
  add column if not exists qt_emballage numeric not null default 0;

-- ------------------------------------------------------------
-- scripts/sql/add_numero_programme.sql
-- ------------------------------------------------------------
-- Ajoute un numero de programme sequentiel (MB1, MB2, MB3...) sur la table
-- programmes. Un seul numero par enregistrement (toutes les lignes/articles
-- d'un meme programme, crees dans le meme formulaire, partagent le meme
-- numero) - affiche cote app comme "MB" + numero_programme.
alter table programmes
  add column if not exists numero_programme integer;

-- ------------------------------------------------------------
-- scripts/sql/add_programme_remarque_statut.sql
-- ------------------------------------------------------------
-- Remarque (texte libre) et Statut (En attente / Partiellement fini / Fini)
-- sur la table programmes. Comme date_jour et numero_programme, ces deux
-- champs sont partages par toutes les lignes d'un meme numero_programme
-- (meme "MB") - les modifier met a jour toutes les lignes du groupe.
alter table programmes
  add column if not exists remarque text,
  add column if not exists statut text not null default 'En attente';
