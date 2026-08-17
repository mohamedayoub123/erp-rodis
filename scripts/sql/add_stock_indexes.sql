-- Index utilises par stock_mp_display_rows / stock_pf_display_rows /
-- stock_by_article_depot_pf / stock_by_article_depot_mp - aide surtout le
-- tri necessaire au calcul du "stock article" (cumul chronologique par
-- article) et les jointures/regroupements par article.

create index if not exists idx_lots_stock_mp_article_date_id
  on lots_stock_matiere_premiere (article_id, date_jour, id);

create index if not exists idx_lots_stock_pf_article_date_id
  on lots_stock (article_id, date_jour, id);

create index if not exists idx_lots_stock_mp_article_lot
  on lots_stock_matiere_premiere (article_id, numero_lot);

create index if not exists idx_lots_stock_pf_article_lot
  on lots_stock (article_id, numero_lot);
