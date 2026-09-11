-- stock_actuel_mp_rows() ne retournait que a.categorie (large, ex: "ARTICLE
-- DE CONDITIONNEMENT PLASTIQUE") - la page Statistique Article Plastique
-- (app/_components/statistique-article-plastique.tsx, partagee entre Rapport
-- MP et Production Plastique) a besoin du sous-type precis (CAPSULE, FLACON,
-- FLACON PET, POT, POT PET...) pour l'affichage/tri par type, maintenant
-- porte par a.sous_famille depuis l'echange categorie/sous_famille.
--
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

create or replace function stock_actuel_mp_rows()
returns table (
  article_id bigint,
  nom_article text,
  categorie text,
  sous_famille text,
  unite text,
  stock_actuel numeric,
  codes text[]
)
language sql
stable
as $$
  select
    a.id as article_id,
    a.nom_article,
    a.categorie,
    a.sous_famille,
    a.unite,
    coalesce(sum(l.qte_entree - l.qte_sortie), 0) as stock_actuel,
    coalesce(
      array_agg(distinct l.numero_lot) filter (where l.numero_lot is not null and btrim(l.numero_lot) <> ''),
      '{}'
    ) as codes
  from articles_matiere_premiere a
  left join lots_stock_matiere_premiere l on l.article_id = a.id
  group by a.id, a.nom_article, a.categorie, a.sous_famille, a.unite;
$$;
