-- A coller dans Supabase Dashboard > SQL Editor > New query, PROJET V1/PRODUCTION.
--
-- Fusionne 35 articles Matiere Premiere en double (meme produit reel, nom
-- legerement different suite a des ressaisies) - liste fournie par l'utilisateur
-- (fichier "NERP ancien nouveau nom.xlsx", colonnes ancien/nouveau). Chaque paire
-- a ete verifiee avant generation de ce script : les 2 lignes existent bien
-- separement en base, avec un vrai historique de stock sur la ligne "ancien".
--
-- Pour chaque paire : redirige vers la ligne "nouveau" (gardee, nom deja
-- correct) tout ce qui referencait la ligne "ancien" (stock, BC, reservations
-- production, transferts entrepot, recettes), puis supprime la ligne "ancien".
-- Le solde net de stock (deja verifie compatible entre les 2 lignes, meme unite
-- "g"/"Grs" pour les colorants - juste 2 ecritures differentes du meme gramme)
-- se retrouve alors entierement sous le bon nom, sans rien perdre.
--
-- bons_commande_matiere_premiere / production_mp_reserve / transfer_order_lignes
-- / recettes_pf : aucune des 35 lignes "ancien" n'y est actuellement referencee
-- (verifie avant generation) - ces UPDATE sont inclus par securite (si une
-- saisie a lieu entre cette verification et l'execution du script) mais ne
-- change rien aujourd'hui.

-- ALOE VERA EXTRACT POWDER  ->  ALOA VERA EXTRACT POWDER  (id 17 -> id 3737)
update public.lots_stock_matiere_premiere set article_id = 3737 where article_id = 17;
update public.bons_commande_matiere_premiere set article_id = 3737 where article_id = 17;
update public.production_mp_reserve set article_mp_id = 3737 where article_mp_id = 17;
update public.transfer_order_lignes set article_id = 3737 where article_id = 17 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3737 where article_mp_id = 17;

-- AMIDON DE MAIS  ->  AMIDON DE MAÏS  (id 808 -> id 3738)
update public.lots_stock_matiere_premiere set article_id = 3738 where article_id = 808;
update public.bons_commande_matiere_premiere set article_id = 3738 where article_id = 808;
update public.production_mp_reserve set article_mp_id = 3738 where article_mp_id = 808;
update public.transfer_order_lignes set article_id = 3738 where article_id = 808 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3738 where article_mp_id = 808;

-- BASE ALD 20230 - SPLASH  ->  BASE ALD 20230 - SPLASH CAPITAL PARIS  (id 33 -> id 3739)
update public.lots_stock_matiere_premiere set article_id = 3739 where article_id = 33;
update public.bons_commande_matiere_premiere set article_id = 3739 where article_id = 33;
update public.production_mp_reserve set article_mp_id = 3739 where article_mp_id = 33;
update public.transfer_order_lignes set article_id = 3739 where article_id = 33 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3739 where article_mp_id = 33;

-- BASE ALD 24970 ( ANTI MOS )  ->  BASE ALD 24970 (ANTI.MOS)  (id 55 -> id 3740)
update public.lots_stock_matiere_premiere set article_id = 3740 where article_id = 55;
update public.bons_commande_matiere_premiere set article_id = 3740 where article_id = 55;
update public.production_mp_reserve set article_mp_id = 3740 where article_mp_id = 55;
update public.transfer_order_lignes set article_id = 3740 where article_id = 55 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3740 where article_mp_id = 55;

-- BASE AVOCADO OIL (WINT)  ->  AVOCADO OIL  (id 103 -> id 25)
update public.lots_stock_matiere_premiere set article_id = 25 where article_id = 103;
update public.bons_commande_matiere_premiere set article_id = 25 where article_id = 103;
update public.production_mp_reserve set article_mp_id = 25 where article_mp_id = 103;
update public.transfer_order_lignes set article_id = 25 where article_id = 103 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 25 where article_mp_id = 103;

-- BASE CITRONELLE PURE  ->  CITRONELLE PURE  (id 126 -> id 3803)
update public.lots_stock_matiere_premiere set article_id = 3803 where article_id = 126;
update public.bons_commande_matiere_premiere set article_id = 3803 where article_id = 126;
update public.production_mp_reserve set article_mp_id = 3803 where article_mp_id = 126;
update public.transfer_order_lignes set article_id = 3803 where article_id = 126 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3803 where article_mp_id = 126;

-- BASE CUBE EXPLOSION 233635-A  ->  BASE CUBE EXPLOSION 233635-A (RCM)  (id 161 -> id 3763)
update public.lots_stock_matiere_premiere set article_id = 3763 where article_id = 161;
update public.bons_commande_matiere_premiere set article_id = 3763 where article_id = 161;
update public.production_mp_reserve set article_mp_id = 3763 where article_mp_id = 161;
update public.transfer_order_lignes set article_id = 3763 where article_id = 161 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3763 where article_mp_id = 161;

-- BASE DERMA GEL 338608-G  ->  BASE DERMA GEL 338608-G (GEL DOUCHE+SAVON)  (id 162 -> id 3764)
update public.lots_stock_matiere_premiere set article_id = 3764 where article_id = 162;
update public.bons_commande_matiere_premiere set article_id = 3764 where article_id = 162;
update public.production_mp_reserve set article_mp_id = 3764 where article_mp_id = 162;
update public.transfer_order_lignes set article_id = 3764 where article_id = 162 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3764 where article_mp_id = 162;

-- BASE GEL TT INTENSE 336364-B  ->  BASE GEL TT INTENSE 336466-B  (id 173 -> id 3765)
update public.lots_stock_matiere_premiere set article_id = 3765 where article_id = 173;
update public.bons_commande_matiere_premiere set article_id = 3765 where article_id = 173;
update public.production_mp_reserve set article_mp_id = 3765 where article_mp_id = 173;
update public.transfer_order_lignes set article_id = 3765 where article_id = 173 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3765 where article_mp_id = 173;

-- BASE PET 80333 ( ANTI MOS )  ->  BASE PET 80333 (ANTI.MOS)  (id 198 -> id 3766)
update public.lots_stock_matiere_premiere set article_id = 3766 where article_id = 198;
update public.bons_commande_matiere_premiere set article_id = 3766 where article_id = 198;
update public.production_mp_reserve set article_mp_id = 3766 where article_mp_id = 198;
update public.transfer_order_lignes set article_id = 3766 where article_id = 198 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3766 where article_mp_id = 198;

-- BASE PET 80432 (ANTI MOS)  ->  BASE PET 80432 (ANTI.MOS)  (id 199 -> id 3767)
update public.lots_stock_matiere_premiere set article_id = 3767 where article_id = 199;
update public.bons_commande_matiere_premiere set article_id = 3767 where article_id = 199;
update public.production_mp_reserve set article_mp_id = 3767 where article_mp_id = 199;
update public.transfer_order_lignes set article_id = 3767 where article_id = 199 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3767 where article_mp_id = 199;

-- BASE ROYAL FEE  ->  BASE ROYAL FEE 500938-A  (id 206 -> id 3768)
update public.lots_stock_matiere_premiere set article_id = 3768 where article_id = 206;
update public.bons_commande_matiere_premiere set article_id = 3768 where article_id = 206;
update public.production_mp_reserve set article_mp_id = 3768 where article_mp_id = 206;
update public.transfer_order_lignes set article_id = 3768 where article_id = 206 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3768 where article_mp_id = 206;

-- BASE SABAYA 6RL 54244  ->  BASE SABAYA 6RL 54244 / ALD 24981  (id 208 -> id 3769)
update public.lots_stock_matiere_premiere set article_id = 3769 where article_id = 208;
update public.bons_commande_matiere_premiere set article_id = 3769 where article_id = 208;
update public.production_mp_reserve set article_mp_id = 3769 where article_mp_id = 208;
update public.transfer_order_lignes set article_id = 3769 where article_id = 208 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3769 where article_mp_id = 208;

-- BASE SAV 40786 (ANTI MOS )  ->  BASE SAV 40786 (ANTI.MOS)  (id 216 -> id 3770)
update public.lots_stock_matiere_premiere set article_id = 3770 where article_id = 216;
update public.bons_commande_matiere_premiere set article_id = 3770 where article_id = 216;
update public.production_mp_reserve set article_mp_id = 3770 where article_mp_id = 216;
update public.transfer_order_lignes set article_id = 3770 where article_id = 216 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3770 where article_mp_id = 216;

-- BASE SAV 41496 (ANTI MOS )  ->  BASE SAV 41496 (ANTI. MOS)  (id 223 -> id 3771)
update public.lots_stock_matiere_premiere set article_id = 3771 where article_id = 223;
update public.bons_commande_matiere_premiere set article_id = 3771 where article_id = 223;
update public.production_mp_reserve set article_mp_id = 3771 where article_mp_id = 223;
update public.transfer_order_lignes set article_id = 3771 where article_id = 223 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3771 where article_mp_id = 223;

-- BASE STELLINA 702594  ->  BASE STELLINA 702594 (RCB)  (id 229 -> id 3772)
update public.lots_stock_matiere_premiere set article_id = 3772 where article_id = 229;
update public.bons_commande_matiere_premiere set article_id = 3772 where article_id = 229;
update public.production_mp_reserve set article_mp_id = 3772 where article_mp_id = 229;
update public.transfer_order_lignes set article_id = 3772 where article_id = 229 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3772 where article_mp_id = 229;

-- BASE WHITE MAGIC - 1030374  ->  BASE WHITE MAGIC CP10498  (id 239 -> id 240)
update public.lots_stock_matiere_premiere set article_id = 240 where article_id = 239;
update public.bons_commande_matiere_premiere set article_id = 240 where article_id = 239;
update public.production_mp_reserve set article_mp_id = 240 where article_mp_id = 239;
update public.transfer_order_lignes set article_id = 240 where article_id = 239 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 240 where article_mp_id = 239;

-- CARBOPOL ULTREZ 21 POLYMER  ->  CARBOPOL ULTREZ 21 POLYMER (ACRYLATE C10-30)  (id 257 -> id 3795)
update public.lots_stock_matiere_premiere set article_id = 3795 where article_id = 257;
update public.bons_commande_matiere_premiere set article_id = 3795 where article_id = 257;
update public.production_mp_reserve set article_mp_id = 3795 where article_mp_id = 257;
update public.transfer_order_lignes set article_id = 3795 where article_id = 257 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3795 where article_mp_id = 257;

-- CB 100  ->  CB 100 (GLASS ENAMEL)  (id 262 -> id 3799)
update public.lots_stock_matiere_premiere set article_id = 3799 where article_id = 262;
update public.bons_commande_matiere_premiere set article_id = 3799 where article_id = 262;
update public.production_mp_reserve set article_mp_id = 3799 where article_mp_id = 262;
update public.transfer_order_lignes set article_id = 3799 where article_id = 262 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3799 where article_mp_id = 262;

-- CETYLPYDINIKUM CHLORIDE  ->  CETYLPYRIDINIUM CHLORIDE  (id 273 -> id 3802)
update public.lots_stock_matiere_premiere set article_id = 3802 where article_id = 273;
update public.bons_commande_matiere_premiere set article_id = 3802 where article_id = 273;
update public.production_mp_reserve set article_mp_id = 3802 where article_mp_id = 273;
update public.transfer_order_lignes set article_id = 3802 where article_id = 273 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3802 where article_mp_id = 273;

-- COLORANT BLEU COVARINE W6795 WS 6797  ->  COLORANT BLEU COVARINE WS 6797 // CI74160  (id 279 -> id 3807)
update public.lots_stock_matiere_premiere set article_id = 3807 where article_id = 279;
update public.bons_commande_matiere_premiere set article_id = 3807 where article_id = 279;
update public.production_mp_reserve set article_mp_id = 3807 where article_mp_id = 279;
update public.transfer_order_lignes set article_id = 3807 where article_id = 279 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3807 where article_mp_id = 279;

-- COLORANT JAUNE AU GRAS W1205 COSM  ->  COLORANT JAUNE AU GRAS W1205 COSM - CI12700  (id 286 -> id 3821)
update public.lots_stock_matiere_premiere set article_id = 3821 where article_id = 286;
update public.bons_commande_matiere_premiere set article_id = 3821 where article_id = 286;
update public.production_mp_reserve set article_mp_id = 3821 where article_mp_id = 286;
update public.transfer_order_lignes set article_id = 3821 where article_id = 286 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3821 where article_mp_id = 286;

-- COLORANT JAUNE COVARINE W1793 WS1797 COSM  ->  COLORANT JAUNE COVARINE WS1797 / CI 11680  (id 287 -> id 3938)
update public.lots_stock_matiere_premiere set article_id = 3938 where article_id = 287;
update public.bons_commande_matiere_premiere set article_id = 3938 where article_id = 287;
update public.production_mp_reserve set article_mp_id = 3938 where article_mp_id = 287;
update public.transfer_order_lignes set article_id = 3938 where article_id = 287 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3938 where article_mp_id = 287;

-- COLORANT MARRON A EAU TG2000  ->  COLORANT MARRON A EAU TG  (id 289 -> id 3827)
update public.lots_stock_matiere_premiere set article_id = 3827 where article_id = 289;
update public.bons_commande_matiere_premiere set article_id = 3827 where article_id = 289;
update public.production_mp_reserve set article_mp_id = 3827 where article_mp_id = 289;
update public.transfer_order_lignes set article_id = 3827 where article_id = 289 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3827 where article_mp_id = 289;

-- COLORANT MARRON AU GRAS TG5000  ->  COLORANT MARRON AU GRAS TG  (id 290 -> id 3828)
update public.lots_stock_matiere_premiere set article_id = 3828 where article_id = 290;
update public.bons_commande_matiere_premiere set article_id = 3828 where article_id = 290;
update public.production_mp_reserve set article_mp_id = 3828 where article_mp_id = 290;
update public.transfer_order_lignes set article_id = 3828 where article_id = 290 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3828 where article_mp_id = 290;

-- COLORANT ORANGE AOR7  ->  COLORANT ORANGE AOR7 / CI 15510  (id 291 -> id 3890)
update public.lots_stock_matiere_premiere set article_id = 3890 where article_id = 291;
update public.bons_commande_matiere_premiere set article_id = 3890 where article_id = 291;
update public.production_mp_reserve set article_mp_id = 3890 where article_mp_id = 291;
update public.transfer_order_lignes set article_id = 3890 where article_id = 291 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3890 where article_mp_id = 291;

-- COLORANT POWDER BLEU CI 42090  ->  COLORANT POWDER BLUE CI42090  (id 295 -> id 3909)
update public.lots_stock_matiere_premiere set article_id = 3909 where article_id = 295;
update public.bons_commande_matiere_premiere set article_id = 3909 where article_id = 295;
update public.production_mp_reserve set article_mp_id = 3909 where article_mp_id = 295;
update public.transfer_order_lignes set article_id = 3909 where article_id = 295 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3909 where article_mp_id = 295;

-- COLORANT ROUGE A EAU // NOUROU  ->  COLORANT ROUGE A EAU // NOUROU / ROUGE A EAU TG  (id 297 -> id 3919)
update public.lots_stock_matiere_premiere set article_id = 3919 where article_id = 297;
update public.bons_commande_matiere_premiere set article_id = 3919 where article_id = 297;
update public.production_mp_reserve set article_mp_id = 3919 where article_mp_id = 297;
update public.transfer_order_lignes set article_id = 3919 where article_id = 297 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3919 where article_mp_id = 297;

-- COLORANT ROUGE COVARINE W3799 COSM WS 3797  ->  COLORANT ROUGE COVARINE W3799 // WS 3797// CI12490  (id 302 -> id 3920)
update public.lots_stock_matiere_premiere set article_id = 3920 where article_id = 302;
update public.bons_commande_matiere_premiere set article_id = 3920 where article_id = 302;
update public.production_mp_reserve set article_mp_id = 3920 where article_mp_id = 302;
update public.transfer_order_lignes set article_id = 3920 where article_id = 302 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3920 where article_mp_id = 302;

-- COLORANT VERT COVARINE W7792 WS 7793  ->  COLORANT VERT COVARINE WS 7793 // CI74260  (id 308 -> id 3925)
update public.lots_stock_matiere_premiere set article_id = 3925 where article_id = 308;
update public.bons_commande_matiere_premiere set article_id = 3925 where article_id = 308;
update public.production_mp_reserve set article_mp_id = 3925 where article_mp_id = 308;
update public.transfer_order_lignes set article_id = 3925 where article_id = 308 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3925 where article_mp_id = 308;

-- ETHANOL 96(XTRA NAT ALCOHOL DENATURATED  ->  ETHANOL 96% ( ALCOHOL XTR NAT. DENATURATED)  (id 329 -> id 3932)
update public.lots_stock_matiere_premiere set article_id = 3932 where article_id = 329;
update public.bons_commande_matiere_premiere set article_id = 3932 where article_id = 329;
update public.production_mp_reserve set article_mp_id = 3932 where article_mp_id = 329;
update public.transfer_order_lignes set article_id = 3932 where article_id = 329 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3932 where article_mp_id = 329;

-- IBC EAU PARFUMEE  ->  EAU PARFUMEE  (id 359 -> id 326)
update public.lots_stock_matiere_premiere set article_id = 326 where article_id = 359;
update public.bons_commande_matiere_premiere set article_id = 326 where article_id = 359;
update public.production_mp_reserve set article_mp_id = 326 where article_mp_id = 359;
update public.transfer_order_lignes set article_id = 326 where article_id = 359 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 326 where article_mp_id = 359;

-- OPTAMINT CŒUR 761616  ->  OPTAMINT COEUR 761616  (id 379 -> id 4000)
update public.lots_stock_matiere_premiere set article_id = 4000 where article_id = 379;
update public.bons_commande_matiere_premiere set article_id = 4000 where article_id = 379;
update public.production_mp_reserve set article_mp_id = 4000 where article_mp_id = 379;
update public.transfer_order_lignes set article_id = 4000 where article_id = 379 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 4000 where article_mp_id = 379;

-- POTASSIUM HYDROXIDE 90%  ->  HYDROXIDE DE POTASSIUM 90% (KOH)  (id 392 -> id 3992)
update public.lots_stock_matiere_premiere set article_id = 3992 where article_id = 392;
update public.bons_commande_matiere_premiere set article_id = 3992 where article_id = 392;
update public.production_mp_reserve set article_mp_id = 3992 where article_mp_id = 392;
update public.transfer_order_lignes set article_id = 3992 where article_id = 392 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 3992 where article_mp_id = 392;

-- SODIUM TRIPOLYPHOSPHATE (STPP)-(CARFOSEL tm 996)  ->  SODIUM TRIPOLYPHOSPHATE (STPP)  (id 410 -> id 4077)
update public.lots_stock_matiere_premiere set article_id = 4077 where article_id = 410;
update public.bons_commande_matiere_premiere set article_id = 4077 where article_id = 410;
update public.production_mp_reserve set article_mp_id = 4077 where article_mp_id = 410;
update public.transfer_order_lignes set article_id = 4077 where article_id = 410 and article_type = 'MP';
update public.recettes_pf set article_mp_id = 4077 where article_mp_id = 410;

-- Supprime les 35 lignes "ancien" devenues orphelines (tout a ete redirige
-- ci-dessus vers la ligne "nouveau" correspondante).
delete from public.articles_matiere_premiere where id in (
  17, 808, 33, 55, 103, 126, 161, 162, 173, 198, 199, 206, 208, 216, 223, 229, 239, 257, 262, 273, 279, 286, 287, 289, 290, 291, 295, 297, 302, 308, 329, 359, 379, 392, 410
);
