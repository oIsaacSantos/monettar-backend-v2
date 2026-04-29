create table if not exists supplies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  unit text not null default 'unidade',
  cost_per_unit numeric(12, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_supplies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  supply_id uuid not null references supplies(id) on delete cascade,
  quantity_used numeric(12, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_supplies_business_id
  on supplies(business_id);

create index if not exists idx_service_supplies_business_service
  on service_supplies(business_id, service_id);

create unique index if not exists idx_service_supplies_unique_supply
  on service_supplies(service_id, supply_id);
