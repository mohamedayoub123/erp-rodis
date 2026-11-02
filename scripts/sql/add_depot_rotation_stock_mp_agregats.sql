-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Rotation de Stock MP : meme calcul que rotation_stock_mp_agregats(date, date) (scripts/sql/create_rotation_stock_mp_agregats.sql),
-- mais limite a UN SEUL depot (la page utilise le Depot E : stock, stock d'il y a 12 mois et sorties ne comptent plus que ce depot).
-- Le depot d'un mouvement est son depot_id, sinon le depot par defaut de son article (meme regle que la page du depot et que
-- stock_by_article_depot_mp).
--
-- Cree une 2e version de la fonction (avec p_depot_id) : l'ancienne version a 2 parametres n'est ni modifiee ni supprimee.
-- Idempotent (peut etre relance sans risque). Lecture seule - ne modifie aucune donnee.
create or replace function public.rotation_stock_mp_agregats(p_debut_12_mois date, p_debut_1_mois date, p_depot_id bigint)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'article_id', t.article_id,
    'stock', t.stock,
    'stock_avant_12_mois', t.stock_avant_12_mois,
    'consommation_12_mois', t.consommation_12_mois,
    'consommation_1_mois', t.consommation_1_mois
  )), '[]'::jsonb)
  from (
    select
      l.article_id,
      sum(coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0)) as stock,
      sum(case
            when l.date_jour is null or l.date_jour < p_debut_12_mois
              then coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0)
            else 0
          end) as stock_avant_12_mois,
      sum(case when l.date_jour >= p_debut_12_mois then coalesce(l.qte_sortie, 0) else 0 end) as consommation_12_mois,
      sum(case when l.date_jour >= p_debut_1_mois then coalesce(l.qte_sortie, 0) else 0 end) as consommation_1_mois
    from public.lots_stock_matiere_premiere l
    join public.articles_matiere_premiere a on a.id = l.article_id
    where l.article_id is not null
      and coalesce(l.depot_id, a.depot_id) = p_depot_id
    group by l.article_id
  ) t;
$$;
