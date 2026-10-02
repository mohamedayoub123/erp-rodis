-- Rotation de Stock MP : la page telechargeait TOUS les mouvements de
-- matiere premiere (plus de 62 000 lignes, lues par pages de 1000 une apres
-- l'autre, ~20 s) uniquement pour en faire 4 sommes par article. Cette
-- fonction fait ces sommes directement dans la base et ne renvoie qu'une
-- ligne par article.
--
-- Memes definitions que le calcul qu'elle remplace (rotation/page.tsx) :
--   stock                 = somme entree - sortie, tous mouvements
--   stock_avant_12_mois   = meme somme, mouvements AVANT p_debut_12_mois
--   consommation_12_mois  = somme des sorties depuis p_debut_12_mois
--   consommation_1_mois   = somme des sorties depuis p_debut_1_mois
--
-- Renvoie un seul jsonb (tableau) plutot qu'une table : une table serait
-- tronquee a 1000 lignes par l'API, alors qu'il y a plus de 1700 articles.
-- Lecture seule - ne modifie aucune donnee.
create or replace function public.rotation_stock_mp_agregats(p_debut_12_mois date, p_debut_1_mois date)
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
    where l.article_id is not null
    group by l.article_id
  ) t;
$$;
