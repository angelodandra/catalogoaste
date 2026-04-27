-- Migrazione: costo reale d'asta + parametri asta sul catalogo
-- Eseguire nel pannello Supabase → SQL Editor

-- ─── PRODUCTS ────────────────────────────────────────────────────────
-- Costo reale del lotto (imponibile asta + maggiorazioni: casse, trasporto, commissione)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_eur NUMERIC(10,2);

-- Imponibile asta grezzo (Totale € letto dal file, prima delle maggiorazioni)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS auction_total_eur NUMERIC(10,2);

-- Prezzo €/Kg battuto in asta (utile per riferimento e ricalcoli)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS auction_price_per_kg NUMERIC(10,4);

-- Numero di casse del lotto (necessario per la formula Civitavecchia)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS auction_boxes_count INTEGER;

-- ─── CATALOGS ────────────────────────────────────────────────────────
-- Tipo di asta sorgente per il catalogo (es. 'civitavecchia', 'agde', 'sete', ...)
ALTER TABLE catalogs
  ADD COLUMN IF NOT EXISTS asta_type TEXT;

-- Parametri formula asta in formato JSON
-- es. per civitavecchia: { "boxCost": 1, "transportBoxCost": 2, "commissionRate": 2 }
ALTER TABLE catalogs
  ADD COLUMN IF NOT EXISTS asta_params JSONB;

-- ─── COMMENTI ────────────────────────────────────────────────────────
COMMENT ON COLUMN products.cost_eur IS 'Costo reale del lotto: imponibile asta + maggiorazioni (casse, trasporto, commissione)';
COMMENT ON COLUMN products.auction_total_eur IS 'Imponibile asta grezzo (Totale € dal file, pre-maggiorazioni)';
COMMENT ON COLUMN products.auction_price_per_kg IS 'Prezzo €/Kg battuto in asta';
COMMENT ON COLUMN products.auction_boxes_count IS 'Numero casse del lotto';
COMMENT ON COLUMN catalogs.asta_type IS 'Tipo asta sorgente: civitavecchia, agde, sete, tarragona, roses';
COMMENT ON COLUMN catalogs.asta_params IS 'Parametri formula asta (JSON)';
