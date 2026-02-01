-- Ajout du montant HT par commande pour les stats (chiffre d'affaires HT exact)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS total_amount_ht DECIMAL(10, 2);

COMMENT ON COLUMN orders.total_amount_ht IS 'Montant total HT de la commande (produits + livraison) pour stats exactes multi-taux TVA';
