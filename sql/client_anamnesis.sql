CREATE TABLE IF NOT EXISTS client_anamnesis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id),
  client_id uuid REFERENCES clients(id),
  service_id uuid REFERENCES services(id) NULL,
  answers jsonb DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE client_anamnesis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_anamnesis_select_own_business" ON client_anamnesis;
DROP POLICY IF EXISTS "client_anamnesis_insert_own_business" ON client_anamnesis;
DROP POLICY IF EXISTS "client_anamnesis_update_own_business" ON client_anamnesis;

CREATE POLICY "client_anamnesis_select_own_business"
ON client_anamnesis
FOR SELECT
TO authenticated
USING (
  business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  )
);

CREATE POLICY "client_anamnesis_insert_own_business"
ON client_anamnesis
FOR INSERT
TO authenticated
WITH CHECK (
  business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  )
);

CREATE POLICY "client_anamnesis_update_own_business"
ON client_anamnesis
FOR UPDATE
TO authenticated
USING (
  business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  )
);
