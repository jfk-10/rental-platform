-- Rental Platform database schema (PostgreSQL / Supabase)

create extension if not exists "pgcrypto";

create table if not exists users (
  user_id bigint generated always as identity primary key,
  auth_user_id uuid unique,
  name text not null,
  email text not null unique,
  password text,
  role text not null check (role in ('admin', 'owner', 'tenant')),
  phone text,
  city text,
  profile_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists owners (
  owner_id bigint generated always as identity primary key,
  user_id bigint not null unique references users(user_id) on delete cascade,
  phone text,
  address text,
  city text,
  owner_type text default 'Individual',
  created_at timestamptz not null default now()
);

create table if not exists tenants (
  tenant_id bigint generated always as identity primary key,
  user_id bigint not null unique references users(user_id) on delete cascade,
  phone text,
  aadhaar_no text,
  occupation text,
  permanent_address text,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists properties (
  property_id bigint generated always as identity primary key,
  owner_id bigint not null references owners(owner_id) on delete cascade,
  title text not null,
  property_type text not null,
  address text not null,
  city text not null,
  area_sqft integer,
  bedrooms integer,
  bathrooms integer,
  office_rooms integer,
  shop_units integer,
  rent_amount numeric(12,2) not null check (rent_amount >= 0),
  allowed_usage text,
  status text not null default 'Available' check (status in ('Available', 'Rented', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists property_images (
  image_id bigint generated always as identity primary key,
  property_id bigint not null references properties(property_id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists rental_agreements (
  agreement_id bigint generated always as identity primary key,
  property_id bigint not null references properties(property_id) on delete cascade,
  tenant_id bigint not null references tenants(tenant_id) on delete cascade,
  start_date date not null,
  end_date date not null,
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  police_verified boolean not null default false,
  agreement_status text not null default 'Active' check (agreement_status in ('Active', 'Completed', 'Terminated')),
  created_at timestamptz not null default now(),
  constraint agreement_date_check check (end_date >= start_date)
);

create table if not exists rent_payments (
  payment_id bigint generated always as identity primary key,
  agreement_id bigint not null references rental_agreements(agreement_id) on delete cascade,
  payment_month text not null,
  amount_paid numeric(12,2) not null check (amount_paid >= 0),
  payment_date date not null,
  payment_mode text not null,
  payment_status text not null default 'Paid',
  created_at timestamptz not null default now()
);

create table if not exists maintenance_requests (
  request_id bigint generated always as identity primary key,
  agreement_id bigint not null references rental_agreements(agreement_id) on delete cascade,
  issue_type text not null,
  description text not null,
  request_date date not null default current_date,
  status text not null default 'Open',
  cost_estimate numeric(12,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_properties_city_status on properties(city, status);
create index if not exists idx_agreements_tenant on rental_agreements(tenant_id);
create index if not exists idx_agreements_property on rental_agreements(property_id);
create index if not exists idx_payments_agreement on rent_payments(agreement_id);
create index if not exists idx_maintenance_agreement on maintenance_requests(agreement_id);
