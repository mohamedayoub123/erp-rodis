-- Quand 2+ lignes partagent le meme ORDRE (voir la migration precedente
-- drop_ordre_unique_rapport_gamme_statistique_mp.sql), il faut un moyen
-- fiable de garantir qu'une ligne qu'on vient de deplacer sur ce numero
-- s'affiche APRES celles deja presentes - comparer par id ne marche pas
-- toujours (une ligne ancienne, id petit, deplacee vers un groupe recent,
-- id plus grand, se retrouverait quand meme devant). Cette colonne est
-- mise a jour uniquement quand l'ORDRE d'une ligne change vraiment (voir
-- saveRapportGammeStatistiqueAction) ; NULL = jamais deplacee manuellement,
-- trie alors en premier dans son groupe (NULLS FIRST).
alter table public.rapport_gamme_statistique_mp
  add column if not exists ordre_updated_at timestamptz;
