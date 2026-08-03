-- Etape 0 du plan de verrouillage SQL : index de preparation.
-- A executer une seule fois dans Supabase Dashboard > SQL Editor > New query.
-- Ces index reduisent le temps passe sous verrou par les futures fonctions
-- stock_* (elles lisent lots_stock/fifo_resultats/commande_lignes en entier
-- pendant qu'elles detiennent un verrou pg_advisory_xact_lock par article).

create index if not exists idx_lots_stock_article_date
  on public.lots_stock (article_id, date_jour, id);

create index if not exists idx_fifo_resultats_commande
  on public.fifo_resultats (commande_id);

create index if not exists idx_fifo_resultats_lot
  on public.fifo_resultats (lot_stock_id);

create index if not exists idx_commande_lignes_commande
  on public.commande_lignes (commande_id);
