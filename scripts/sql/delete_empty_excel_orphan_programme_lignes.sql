-- A coller dans Supabase Dashboard > SQL Editor > New query, puis Run.

-- Nettoie l'import Excel historique de "Programme par ligne" : 64 lignes
-- avaient ete importees sans groupe_id (jamais rattachees a un vrai
-- programme), ce qui les faisait apparaitre groupees a tort dans
-- Historique programme (ex: "PL6131.2026") avec une page detail
-- inaccessible (404). Sur ces 64, 57 ont deja une vraie saisie de
-- production (Conditionnement/Fabrication/Emballage) dessus et sont
-- gardees ; ces 7 n'ont RIEN dessus (aucune ligne dans
-- production_carton_entries/production_vrac_entries/
-- production_emballage_entries) et sont donc supprimees sans rien perdre.
delete from public.programme_lignes
where id in (7378, 7379, 7380, 7381, 7435, 7441, 7449);
