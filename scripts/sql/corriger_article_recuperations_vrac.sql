-- A coller dans Supabase Dashboard > SQL Editor > New query.
-- Recuperation de vrac (Fabrication > Code vrac recupere) : jusqu au 14/10/2026 la sortie etait enregistree sur l ARTICLE DE LA LIGNE
-- et non sur l article qui possede le lot choisi - le stock du lot recupere ne baissait donc jamais. Ce script deplace les 42
-- mouvements dont le vrai article est connu (le lot n a qu un seul article proprietaire au Depot B).
-- Les 84 autres (lots jamais credites au Depot B, ex : BDG0038, BDG0039) ne sont PAS touches.
--
-- ATTENTION : 3 lots passent en NEGATIF apres correction (plus recupere que de stock enregistre) :
--   BCA0008V : 144.8 -> -142.2 | AZAK0035 : 164 -> -36 | AZCAM0001V : 27 -> -13
--
-- 1) Sauvegarde des lignes avant modification (pour pouvoir revenir en arriere)
create table if not exists public.lots_stock_sauvegarde_recuperation_20261014 as
select * from public.lots_stock where id in (256692, 256693, 256694, 256695, 256696, 256699, 256071, 256701, 256702, 257161, 256703, 257162, 256074, 256155, 257163, 256157, 257164, 256161, 257165, 257166, 256835, 257167, 256836, 256837, 257169, 257170, 256382, 256955, 256956, 256957, 256958, 256959, 256960, 256961, 256962, 256404, 256405, 256407, 256966, 256410, 256978, 255329);

-- 2) Deplacement des sorties vers l article proprietaire du lot
update public.lots_stock m
set article_id = v.vrai_article
from (values
    (256692, 6396),
    (256693, 6396),
    (256694, 6669),
    (256695, 6396),
    (256696, 6396),
    (256699, 6395),
    (256071, 6395),
    (256701, 6396),
    (256702, 6396),
    (257161, 6669),
    (256703, 6396),
    (257162, 6669),
    (256074, 6395),
    (256155, 6612),
    (257163, 6669),
    (256157, 6395),
    (257164, 6669),
    (256161, 6395),
    (257165, 6669),
    (257166, 6669),
    (256835, 6395),
    (257167, 6612),
    (256836, 6395),
    (256837, 6396),
    (257169, 6396),
    (257170, 6396),
    (256382, 6395),
    (256955, 6669),
    (256956, 6395),
    (256957, 6669),
    (256958, 6669),
    (256959, 6669),
    (256960, 6669),
    (256961, 6669),
    (256962, 6669),
    (256404, 6396),
    (256405, 6396),
    (256407, 6396),
    (256966, 6669),
    (256410, 6396),
    (256978, 6396),
    (255329, 6395)
) as v(id, vrai_article)
where m.id = v.id
  and m.source_import = 'web:fabrication-recuperation'
  and m.note like 'Recuperation vrac - ligne%'
  and m.article_id <> v.vrai_article;

-- 3) Controle : doit afficher les soldes apres correction
select article_id, numero_lot, sum(qte_entree - qte_sortie) as solde
from public.lots_stock
where depot_id = 2 and numero_lot in ('BCA0008V', 'BA0050V', 'AZAK0035', 'AZCAM0001V', 'BCA0021')
group by article_id, numero_lot
order by numero_lot, article_id;

-- Pour annuler (si besoin) :
-- update public.lots_stock m set article_id = s.article_id
-- from public.lots_stock_sauvegarde_recuperation_20261014 s where m.id = s.id;
