-- Prevent users from applying to rent properties they own.

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
