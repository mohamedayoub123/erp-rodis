-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET DEV/V2.
--
-- programme_lignes id=9 (MB.2026.1, Lait WHITE SECRET 200ml) a ete decoupe
-- en 2 codes AVANT la correction qui arrondit toujours le nombre de carton
-- au superieur - numero_lot_detail garde donc encore 312.5 cartons par
-- code au lieu de 313. La page Besoin arrondit deja qt a l'affichage/calcul
-- (voir besoin/[ligneId]/page.tsx), mais corrige aussi la donnee stockee
-- ici pour que le Dashboard et l'entete de la fiche Conditionnement
-- affichent 313 partout, pas seulement le calcul du besoin MP.
update public.programme_lignes
set numero_lot_detail = '[
  {"code": "AA4199V", "qt_vrac": 3000, "qt_carton": 313},
  {"code": "AA4200V", "qt_vrac": 3000, "qt_carton": 313}
]'::jsonb
where id = 9;

-- Verification
select numero_lot_detail from public.programme_lignes where id = 9;
