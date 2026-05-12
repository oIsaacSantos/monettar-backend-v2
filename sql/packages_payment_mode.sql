ALTER TABLE service_packages
ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT 'upfront';

UPDATE service_packages
SET payment_mode = 'upfront'
WHERE payment_mode IS NULL;

ALTER TABLE service_packages
DROP CONSTRAINT IF EXISTS service_packages_payment_mode_check;

ALTER TABLE service_packages
ADD CONSTRAINT service_packages_payment_mode_check
CHECK (payment_mode IN ('upfront', 'distributed'));
