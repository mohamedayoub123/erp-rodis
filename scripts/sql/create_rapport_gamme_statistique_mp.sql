-- Rapport par Gamme Statistique MP (ex: MP COSMETIQUE) - copie fidele des
-- fichiers "INV <gamme>.xlsx" fournis par l'utilisateur (dossier partage,
-- un fichier par gamme). Chaque ligne = un article, avec ses colonnes
-- exactement comme dans le fichier Excel source (memes noms, dans
-- "donnees"), plus la couleur de la cellule ORDRE qui indique la
-- categorie de rotation (legende en haut du fichier Excel : orange =
-- FORTE ROTATION, blanc = MOYENNE ROTATION, bleu = DORMANT, vert = NEW
-- PROJECT).
create table if not exists public.rapport_gamme_statistique_mp (
  id bigint generated always as identity primary key,
  gamme_statistique text not null,
  ordre int not null,
  designation text not null,
  categorie text,
  donnees jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.rapport_gamme_statistique_mp
  drop constraint if exists rapport_gamme_statistique_mp_unique;

alter table public.rapport_gamme_statistique_mp
  add constraint rapport_gamme_statistique_mp_unique unique (gamme_statistique, ordre);
