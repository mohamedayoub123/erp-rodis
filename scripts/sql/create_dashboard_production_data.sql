-- Dashboard Production : rapatrie TOUT ce dont la page a besoin en UN SEUL
-- aller-retour vers la base, au lieu d'une dizaine de requetes enchainees
-- (lignes actives, puis entrees carton/vrac/emballage, codes termines,
-- reservations MP, tests labo, historique PD, articles - chacune paginee par
-- 1000 lignes, et la plupart attendant la fin de la precedente). Les entrees
-- sont deja SOMMEES par (ligne, code) cote base : le Dashboard n'a besoin que
-- de ces totaux, jamais des lignes individuelles.
--
-- Memes regles que les requetes qu'elle remplace (app/production/suivi/
-- dashboard/page.tsx + data.ts) :
--   * lignes : exclu_rapports = false, programme_termine faux/NULL,
--     confirme_production = true, triees date_jour desc puis created_at desc
--   * PD : rang des groupes par date de premiere sauvegarde (PD1, PD2...),
--     le dernier groupe enregistre gagne si un code apparait dans plusieurs
--   * reservations MP en attente : stage pesage -> "vrac", salle_conditionnement
--     -> "carton", seulement si une reservation a encore quantite > 0
--
-- Ne modifie AUCUNE donnee - lecture seule.
create or replace function public.dashboard_production_data()
returns jsonb
language sql
stable
as $$
  with active as (
    select pl.id
    from public.programme_lignes pl
    where pl.exclu_rapports = false
      and (pl.programme_termine = false or pl.programme_termine is null)
      and pl.confirme_production = true
  ),
  pd_groupes as (
    select groupe_id, min(created_at) as premier
    from public.programme_dispatcher_history
    where groupe_id is not null
    group by groupe_id
  ),
  pd_rang as (
    select groupe_id, 'PD' || (row_number() over (order by premier, groupe_id))::text as label
    from pd_groupes
  ),
  pd_codes as (
    select distinct on (h.code) h.code, r.label
    from public.programme_dispatcher_history h
    join pd_rang r on r.groupe_id = h.groupe_id
    where h.code is not null and h.code <> ''
    order by h.code, h.id desc
  )
  select jsonb_build_object(
    'lignes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.date_jour desc, x.created_at desc)
      from (
        select pl.id, pl.groupe_id, pl.zone, pl.chaine, pl.article_id, pl.produit, pl.qt_carton,
               pl.vrac_a_fabriquer, pl.plateforme, pl.date_jour, pl.created_at, pl.vrac_termine,
               pl.vrac_termine_date, pl.carton_termine, pl.carton_termine_date, pl.emballage_termine,
               pl.emballage_termine_date, pl.numero_lot, pl.numero_lot_detail, pl.programme_termine,
               pl.programme_termine_date
        from public.programme_lignes pl
        where pl.id in (select id from active)
      ) x
    ), '[]'::jsonb),
    'carton', coalesce((
      select jsonb_agg(jsonb_build_object('programme_ligne_id', e.programme_ligne_id, 'code', e.code, 'quantite', e.quantite))
      from (
        select programme_ligne_id, code, sum(quantite) as quantite
        from public.production_carton_entries
        where programme_ligne_id in (select id from active)
        group by programme_ligne_id, code
      ) e
    ), '[]'::jsonb),
    'vrac', coalesce((
      select jsonb_agg(jsonb_build_object('programme_ligne_id', e.programme_ligne_id, 'code', e.code, 'quantite', e.quantite))
      from (
        select programme_ligne_id, code, sum(quantite) as quantite
        from public.production_vrac_entries
        where programme_ligne_id in (select id from active)
        group by programme_ligne_id, code
      ) e
    ), '[]'::jsonb),
    'emballage', coalesce((
      select jsonb_agg(jsonb_build_object('programme_ligne_id', e.programme_ligne_id, 'code', e.code, 'quantite', e.quantite))
      from (
        select programme_ligne_id, code, sum(quantite) as quantite
        from public.production_emballage_entries
        where programme_ligne_id in (select id from active)
        group by programme_ligne_id, code
      ) e
    ), '[]'::jsonb),
    'code_termine', coalesce((
      select jsonb_agg(jsonb_build_object('programme_ligne_id', ct.programme_ligne_id, 'code', ct.code, 'stage', ct.stage))
      from public.production_code_termine ct
      where ct.programme_ligne_id in (select id from active)
    ), '[]'::jsonb),
    'reserves_en_attente', coalesce((
      select jsonb_agg(jsonb_build_object(
        'programme_ligne_id', ct.programme_ligne_id,
        'code', ct.code,
        'stage', case when ct.stage = 'pesage' then 'vrac' else 'carton' end
      ))
      from public.production_code_termine ct
      where ct.programme_ligne_id in (select id from active)
        and ct.stage in ('pesage', 'salle_conditionnement')
        and exists (
          select 1 from public.production_mp_reserve r
          where r.production_code_termine_id = ct.id and r.quantite > 0
        )
    ), '[]'::jsonb),
    'test_labo', coalesce((
      select jsonb_agg(jsonb_build_object(
        'programme_ligne_id', t.programme_ligne_id, 'code', t.code, 'utilisateur', t.utilisateur
      ))
      from (
        select distinct on (programme_ligne_id, coalesce(code, ''))
               programme_ligne_id, coalesce(code, '') as code, utilisateur_test_labo as utilisateur
        from public.production_rapports
        where programme_ligne_id in (select id from active)
          and utilisateur_test_labo is not null
        order by programme_ligne_id, coalesce(code, ''), id desc
      ) t
    ), '[]'::jsonb),
    'pd_par_code', coalesce((select jsonb_object_agg(code, label) from pd_codes), '{}'::jsonb),
    'articles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nom_article', a.nom_article, 'gamme', a.gamme, 'vrac_article_id', a.vrac_article_id
      ) order by a.nom_article)
      from public.articles a
    ), '[]'::jsonb)
  );
$$;
