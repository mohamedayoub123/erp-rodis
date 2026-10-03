-- Pages Matiere Premiere (Stock Alert, Stock Dormant, Surstock, Stock Min
-- Propose, Proposition de Commande, Besoin Commande) : chacune telechargeait
-- TOUS les mouvements de matiere premiere (plus de 63 000 lignes, lues par
-- pages de 1000 une apres l'autre, ~20 s et une forte charge sur la base)
-- uniquement pour en faire des sommes par article. Cette fonction fait ces
-- sommes directement dans la base et ne renvoie qu'une ligne par article.
--
-- Memes definitions que les calculs qu'elle remplace :
--   stock               = somme entree - sortie, tous mouvements
--   entree_N_mois       = somme des entrees dont date_jour >= p_debut_N_mois
--   sortie_N_mois       = somme des sorties dont date_jour >= p_debut_N_mois
--   sortie_pos_N_mois   = idem mais uniquement les mouvements de sortie > 0
--                         (Stock Dormant ignore les sorties negatives)
--   derniere_sortie     = date la plus recente d'un mouvement de sortie > 0
--   premiere_entree     = date la plus ancienne d'un mouvement d'entree > 0
--   sortie_par_mois     = 12 valeurs (janvier..decembre) : sorties des 12
--                         derniers mois regroupees par mois calendaire
--
-- Renvoie un seul jsonb (tableau) plutot qu'une table : une table serait
-- tronquee a 1000 lignes par l'API, alors qu'il y a plus de 1700 articles.
-- Lecture seule - ne modifie aucune donnee.
create or replace function public.mp_agregats_par_article(
  p_debut_1_mois date,
  p_debut_3_mois date,
  p_debut_6_mois date,
  p_debut_12_mois date
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'article_id', t.article_id,
    'stock', t.stock,
    'entree_3_mois', t.entree_3_mois,
    'entree_12_mois', t.entree_12_mois,
    'sortie_1_mois', t.sortie_1_mois,
    'sortie_3_mois', t.sortie_3_mois,
    'sortie_6_mois', t.sortie_6_mois,
    'sortie_12_mois', t.sortie_12_mois,
    'sortie_pos_3_mois', t.sortie_pos_3_mois,
    'sortie_pos_6_mois', t.sortie_pos_6_mois,
    'sortie_pos_12_mois', t.sortie_pos_12_mois,
    'derniere_sortie', t.derniere_sortie,
    'premiere_entree', t.premiere_entree,
    'sortie_par_mois', t.sortie_par_mois
  )), '[]'::jsonb)
  from (
    select
      l.article_id,
      sum(coalesce(l.qte_entree, 0) - coalesce(l.qte_sortie, 0)) as stock,
      coalesce(sum(coalesce(l.qte_entree, 0)) filter (where l.date_jour >= p_debut_3_mois), 0) as entree_3_mois,
      coalesce(sum(coalesce(l.qte_entree, 0)) filter (where l.date_jour >= p_debut_12_mois), 0) as entree_12_mois,
      coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_1_mois), 0) as sortie_1_mois,
      coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_3_mois), 0) as sortie_3_mois,
      coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_6_mois), 0) as sortie_6_mois,
      coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois), 0) as sortie_12_mois,
      coalesce(sum(l.qte_sortie) filter (where l.qte_sortie > 0 and l.date_jour >= p_debut_3_mois), 0) as sortie_pos_3_mois,
      coalesce(sum(l.qte_sortie) filter (where l.qte_sortie > 0 and l.date_jour >= p_debut_6_mois), 0) as sortie_pos_6_mois,
      coalesce(sum(l.qte_sortie) filter (where l.qte_sortie > 0 and l.date_jour >= p_debut_12_mois), 0) as sortie_pos_12_mois,
      max(l.date_jour) filter (where l.qte_sortie > 0) as derniere_sortie,
      min(l.date_jour) filter (where l.qte_entree > 0) as premiere_entree,
      jsonb_build_array(
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 1), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 2), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 3), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 4), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 5), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 6), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 7), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 8), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 9), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 10), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 11), 0),
        coalesce(sum(coalesce(l.qte_sortie, 0)) filter (where l.date_jour >= p_debut_12_mois and extract(month from l.date_jour) = 12), 0)
      ) as sortie_par_mois
    from public.lots_stock_matiere_premiere l
    where l.article_id is not null
    group by l.article_id
  ) t;
$$;
