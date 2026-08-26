-- Script "tout-en-un", sans danger a executer meme si certains de ces index
-- existent deja (create index IF NOT EXISTS = ne fait rien si deja present,
-- ne recree jamais). Regroupe les index deja demandes dans d'anciens
-- scripts de cette session (jamais garanti qu'ils aient tous ete colles
-- dans Supabase) + les nouveaux index necessaires pour les derniers
-- correctifs de vitesse de la fiche Commande (filtres par article_id sur
-- fifo_resultats, ligne des camions freres, recherche client).
--
-- Sans index sur une colonne filtree, Postgres doit lire TOUTE la table
-- ligne par ligne (un "sequential scan") au lieu de sauter directement aux
-- bonnes lignes - exactement le genre de "beaucoup de recherche" qui
-- ralentit une page, et qui s'aggrave avec le temps a mesure que les tables
-- grossissent (fifo_resultats et lots_stock ne sont jamais purgees).
--
-- A coller dans Supabase Dashboard > SQL Editor > New query, une seule fois.

-- lots_stock : filtre par article_id partout (fetchStockGroupsByArticle,
-- getArticleAvailabilityMap, dashboard...).
create index if not exists idx_lots_stock_article_date
  on public.lots_stock (article_id, date_jour, id);

-- lots_stock_matiere_premiere : filtre par article_id (cout de revient,
-- fetchLotsAllDepotsBatch).
create index if not exists idx_lots_stock_mp_article
  on public.lots_stock_matiere_premiere (article_id);

-- fifo_resultats : filtre par commande_id (fiche commande, liste), par
-- article_id (calcul des codes disponibles/reserves - nouveau, pas encore
-- couvert par un script precedent), et par lot_stock_id (verrouillage).
create index if not exists idx_fifo_resultats_commande
  on public.fifo_resultats (commande_id);
create index if not exists idx_fifo_resultats_article
  on public.fifo_resultats (article_id);
create index if not exists idx_fifo_resultats_lot
  on public.fifo_resultats (lot_stock_id);

-- commande_lignes : filtre par commande_id partout.
create index if not exists idx_commande_lignes_commande
  on public.commande_lignes (commande_id);

-- recettes_pf : filtre par article_pf_id (cout de revient par recette).
create index if not exists recettes_pf_article_pf_id_idx
  on public.recettes_pf (article_pf_id);

-- commande_paiements : filtre par commande_id.
create index if not exists idx_commande_paiements_commande_id
  on public.commande_paiements (commande_id);

-- ecritures_comptables : filtre par (source_type, source_id) - montant
-- facture d'une commande.
create index if not exists idx_ecritures_comptables_source
  on public.ecritures_comptables (source_type, source_id);

-- commandes : recherche des camions freres par numero_proforma (LIKE
-- 'X-%', beneficie d'un index standard car le joker est a la fin).
create index if not exists idx_commandes_numero_proforma
  on public.commandes (numero_proforma);

-- clients : recherche du pays d'un client par nom normalise.
create index if not exists idx_clients_client_normalise
  on public.clients (client_normalise);
