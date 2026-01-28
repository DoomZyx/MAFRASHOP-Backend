-- Ajouter les statuts "shipped" et "preparing" à la contrainte CHECK de la table orders
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders 
ADD CONSTRAINT orders_status_check 
CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'shipped', 'preparing'));

