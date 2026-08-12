-- Rattrapage partie 7 / 7 : 36 articles dont au
-- moins un champ (categorie/unite/gamme/gamme_statistique/stock min/max)
-- ne correspondait toujours pas au fichier Excel apres le premier passage
-- de sync (01-09 dans le dossier precedent). A executer un par un dans
-- Supabase SQL Editor (New query -> coller -> Run), attendre "Success"
-- avant de passer au fichier suivant.

insert into public.articles_matiere_premiere
  (nom_article, article_normalise, categorie, unite, gamme, gamme_statistique, min_stock, max_stock)
values
  ('TRICLOSAN', 'TRICLOSAN', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('TRIETHANOLAMINE (TEA)', 'TRIETHANOLAMINE(TEA)', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 12500, 25000),
  ('TRIGGER SPRAYER E-5 28/410 BLUE/WHITE COLOR', 'TRIGGERSPRAYERE-528/410BLUE/WHITECOLOR', 'SPRAY', 'pcs', 'LAVE VITRE', 'SPRAY', 0, 0),
  ('TRILON B ( EDETA BD )', 'TRILONB(EDETABD)', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 250, 500),
  ('TUBE ALLU SKIN LIGHT 70', 'TUBEALLUSKINLIGHT70', 'TUBE', 'pcs', 'SKIN LIGHT', 'TUBE VIDE', 0, 0),
  ('TUBE ALLU VIT FEE 70', 'TUBEALLUVITFEE70', 'TUBE', 'pcs', 'VIT FEE', 'TUBE VIDE', 0, 0),
  ('TUBE VIDE BAUME DR. JOHNSON 15G D19', 'TUBEVIDEBAUMEDR.JOHNSON15GD19', 'TUBE', 'pcs', 'Mentholée', 'DR JOHNSON', 12500, 25000),
  ('TUBE VIDE BAUME MATRIX 15G D19', 'TUBEVIDEBAUMEMATRIX15GD19', 'TUBE', 'pcs', 'Mentholée', 'MATRIX', 0, 0),
  ('TUBE VIDE BAUME MATRIX 30G D22', 'TUBEVIDEBAUMEMATRIX30GD22', 'TUBE', 'pcs', 'Mentholée', 'MATRIX', 0, 0),
  ('TUBE VIDE CREME BB CLEAR 50GR', 'TUBEVIDECREMEBBCLEAR50GR', 'TUBE', 'pcs', 'BB CLEAR', 'BB CLEAR', 36000, 72000),
  ('TUBE VIDE CREME BB CLEAR VITAMINE-C 50ML', 'TUBEVIDECREMEBBCLEARVITAMINE-C50ML', 'TUBE', 'pcs', 'BB CLEAR VITAMINE-C', 'BB CLEAR VITAMINE-C', 18000, 36000),
  ('TUBE VIDE CREME COCO CLEAR 70GR', 'TUBEVIDECREMECOCOCLEAR70GR', 'TUBE', 'pcs', 'COCO CLEAR', 'COCO CLEAR', 0, 0),
  ('TUBE VIDE CREME ELIXIR 70GR', 'TUBEVIDECREMEELIXIR70GR', 'TUBE', 'pcs', 'ELIXIR', 'ELIXIR', 36000, 72000),
  ('TUBE VIDE CREME MATRIX 100G D35', 'TUBEVIDECREMEMATRIX100GD35', 'TUBE', 'pcs', 'Mentholée', 'MATRIX', 18000, 36000),
  ('TUBE VIDE CREME PERFECT GLOW 70GR', 'TUBEVIDECREMEPERFECTGLOW70GR', 'TUBE', 'pcs', 'PERFECT GLOW', 'PERFECT GLOW', 72000, 144000),
  ('TUBE VIDE CREME PRECIOUS PERFECT 70GR', 'TUBEVIDECREMEPRECIOUSPERFECT70GR', 'TUBE', 'pcs', 'PRECIOUS PERFECT', 'PRECIOUS PERFECT', 36000, 72000),
  ('TUBE VIDE CREME WHITE SECRET 70G LAMINATED (DIA 35MM)', 'TUBEVIDECREMEWHITESECRET70GLAMINATED(DIA35MM)', 'TUBE', 'pcs', 'WHITE SECRET', 'WHITE SECRET', 108000, 216000),
  ('TUBE VIDE DERMATONE 70GR', 'TUBEVIDEDERMATONE70GR', 'TUBE', 'pcs', 'DERMA TONE', 'DERMA TONE', 0, 0),
  ('TUBE VIDE GEL DR. JOHNSON 100G D35', 'TUBEVIDEGELDR.JOHNSON100GD35', 'TUBE', 'pcs', 'Mentholée', 'DR JOHNSON', 288000, 576000),
  ('TUBE VIDE GEL DR. JOHNSON 15G D19', 'TUBEVIDEGELDR.JOHNSON15GD19', 'TUBE', 'pcs', 'Mentholée', 'DR JOHNSON', 54000, 108000),
  ('TUBE VIDE GEL DR. JOHNSON 30G D22', 'TUBEVIDEGELDR.JOHNSON30GD22', 'TUBE', 'pcs', 'Mentholée', 'DR JOHNSON', 144000, 288000),
  ('TUBE VIDE PRO WHITE 70GR', 'TUBEVIDEPROWHITE70GR', 'TUBE', 'pcs', 'PRO-WHITE', 'PRO-WHITE', 18000, 36000),
  ('UREA 99%', 'UREA99%', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('VASELINE', 'VASELINE', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 250000, 500000),
  ('VISCARESS PL-LQ-(RB)', 'VISCARESSPL-LQ-(RB)', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('VITAMIN A PALMITATE', 'VITAMINAPALMITATE', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('VITAMINE C', 'VITAMINEC', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('VITAMINE E', 'VITAMINEE', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 1250, 2500),
  ('WHITE CAP COVER 250ML (BENE ETRE)', 'WHITECAPCOVER250ML(BENEETRE)', 'CAPSULES-IMP', 'pcs', 'O DE FEMME', 'SPRAY', 0, 0),
  ('WHITE CAP COVER 500ML (BENE ETRE )', 'WHITECAPCOVER500ML(BENEETRE)', 'CAPSULES-IMP', 'pcs', 'O DE FEMME', 'SPRAY', 0, 0),
  ('WITCH HAZEL DISTILLATE SB', 'WITCHHAZELDISTILLATESB', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('XANTHAN GUM', 'XANTHANGUM', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('XANTHAN GUM F200', 'XANTHANGUMF200', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('ZINC CHLORIDE', 'ZINCCHLORIDE', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('ZINC OXIDE', 'ZINCOXIDE', 'mp cosm', 'kg', 'MP COSM', 'MP COSM', 0, 0),
  ('PP COPO MFI 19', 'PPCOPOMFI19', 'mp plastique', 'kg', 'MP PLASTIQUE', 'MP PLASTIQUE', 0, 0)
on conflict (article_normalise) do update set
  nom_article = excluded.nom_article,
  categorie = excluded.categorie,
  unite = excluded.unite,
  gamme = excluded.gamme,
  gamme_statistique = excluded.gamme_statistique,
  min_stock = excluded.min_stock,
  max_stock = excluded.max_stock;
