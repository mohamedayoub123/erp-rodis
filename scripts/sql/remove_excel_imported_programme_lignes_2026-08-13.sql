-- Supprime les "PL" (programme_lignes) qui viennent de l'import en masse
-- depuis le fichier Excel "suivi production" (pas saisies via le
-- dashboard web) - garde uniquement celles creees via le web.
--
-- Signal utilise : cree_par IS NULL. Verifie que ce signal est fiable
-- avant d'executer :
--   - 6179 lignes programme_lignes ont cree_par NULL, TOUTES marquees
--     terminees sur les 4 etapes (vrac/programme/carton/emballage) et
--     creees en une seule rafale le 02/08/2026 (par lots de 100, signature
--     claire d'un script d'import, pas d'une saisie humaine).
--   - 313 lignes ont un vrai cree_par (yovo=203, aziz=107, vincent=2,
--     mayoub=1) - ce sont celles-la qui restent apres ce script.
--   - Les 3 tables de saisie detaillee (production_vrac_entries,
--     production_carton_entries, production_emballage_entries, 1095
--     lignes au total) ne sont liees a AUCUNE des 6179 lignes a supprimer
--     - rien a nettoyer de ce cote, elles restent intactes.
--
-- Ordre important : supprimer d'abord les production_rapports lies (cle
-- etrangere programme_ligne_id), puis les programme_lignes elles-memes.

delete from public.production_rapports
where programme_ligne_id in (
  select id from public.programme_lignes where cree_par is null
);

delete from public.programme_lignes
where cree_par is null;
