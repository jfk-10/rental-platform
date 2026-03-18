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
  status text not null default 'Available' check (status in ('Available', 'Reserved', 'Rented', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists property_images (
  image_id bigint generated always as identity primary key,
  property_id bigint not null references properties(property_id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists property_applications (
  application_id bigint generated always as identity primary key,
  property_id bigint not null references properties(property_id) on delete cascade,
  tenant_id bigint not null references tenants(tenant_id) on delete cascade,
  status text not null default 'Interested' check (
    status in (
      'Interested',
      'Shortlisted',
      'Selected',
      'Agreement Sent',
      'Rejected',
      'Withdrawn'
    )
  ),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_applications_unique_interest unique (property_id, tenant_id)
);

create or replace function prevent_self_rental_applications()
returns trigger
language plpgsql
as $$
declare
  property_owner_user_id bigint;
  tenant_user_id bigint;
begin
  select o.user_id
  into property_owner_user_id
  from properties p
  join owners o on o.owner_id = p.owner_id
  where p.property_id = new.property_id;

  select t.user_id
  into tenant_user_id
  from tenants t
  where t.tenant_id = new.tenant_id;

  if property_owner_user_id is not null
    and tenant_user_id is not null
    and property_owner_user_id = tenant_user_id then
    raise exception 'Owner cannot apply to rent their own property';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_applications_prevent_self_rental on property_applications;
create trigger trg_property_applications_prevent_self_rental
before insert or update on property_applications
for each row execute function prevent_self_rental_applications();

create table if not exists rental_agreements (
  agreement_id bigint generated always as identity primary key,
  property_id bigint not null references properties(property_id) on delete cascade,
  tenant_id bigint not null references tenants(tenant_id) on delete cascade,
  start_date date not null,
  end_date date not null,
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  police_verified boolean not null default false,
  agreement_status text not null default 'Pending Owner' check (
    agreement_status in (
      'Pending Owner',
      'Pending Tenant',
      'Active',
      'Completed',
      'Rejected',
      'Terminated'
    )
  ),
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
create index if not exists idx_property_applications_property on property_applications(property_id);
create index if not exists idx_property_applications_tenant on property_applications(tenant_id);
create index if not exists idx_property_applications_status on property_applications(status);
create index if not exists idx_agreements_tenant on rental_agreements(tenant_id);
create index if not exists idx_agreements_property on rental_agreements(property_id);
create index if not exists idx_payments_agreement on rent_payments(agreement_id);
create index if not exists idx_maintenance_agreement on maintenance_requests(agreement_id);
