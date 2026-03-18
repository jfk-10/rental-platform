-- Enforce one-time profile completion gate for owner uploads and tenant agreement requests.
-- Run this after schema.sql.

begin;

alter table if exists public.users
add column if not exists profile_completed boolean not null default false;

-- Backfill profile_completed for existing users with minimum required fields (phone + city).
update public.users u
set profile_completed = true
where exists (
  select 1
  from public.owners o
  where o.user_id = u.user_id
    and coalesce(nullif(trim(o.phone), ''), '') <> ''
    and coalesce(nullif(trim(o.city), ''), '') <> ''
)
or exists (
  select 1
  from public.tenants t
  where t.user_id = u.user_id
    and coalesce(nullif(trim(t.phone), ''), '') <> ''
    and coalesce(nullif(trim(t.city), ''), '') <> ''
);

create or replace function public.enforce_owner_profile_completion_on_property()
returns trigger
language plpgsql
as $$
declare
  owner_user_id bigint;
  owner_profile_completed boolean;
begin
  select o.user_id
  into owner_user_id
  from public.owners o
  where o.owner_id = new.owner_id;

  if owner_user_id is null then
    raise exception 'Owner account not found for this property.';
  end if;

  select coalesce(u.profile_completed, false)
  into owner_profile_completed
  from public.users u
  where u.user_id = owner_user_id;

  if not owner_profile_completed then
    raise exception 'Complete profile before uploading a property.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_owner_profile_completion_on_property on public.properties;
create trigger trg_enforce_owner_profile_completion_on_property
before insert on public.properties
for each row
execute function public.enforce_owner_profile_completion_on_property();

create or replace function public.enforce_tenant_profile_completion_on_application()
returns trigger
language plpgsql
as $$
declare
  tenant_user_id bigint;
  tenant_profile_completed boolean;
begin
  select t.user_id
  into tenant_user_id
  from public.tenants t
  where t.tenant_id = new.tenant_id;

  if tenant_user_id is null then
    raise exception 'Tenant account not found for this application.';
  end if;

  select coalesce(u.profile_completed, false)
  into tenant_profile_completed
  from public.users u
  where u.user_id = tenant_user_id;

  if not tenant_profile_completed then
    raise exception 'Complete profile before sending agreement requests.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_tenant_profile_completion_on_application on public.property_applications;
create trigger trg_enforce_tenant_profile_completion_on_application
before insert on public.property_applications
for each row
execute function public.enforce_tenant_profile_completion_on_application();

commit;
