alter table fixed_costs
add column if not exists business_share_percent numeric(5, 2) not null default 100;
