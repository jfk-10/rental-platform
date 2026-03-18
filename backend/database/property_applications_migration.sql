alter table public.properties
drop constraint if exists properties_status_check;

alter table public.properties
add constraint properties_status_check
check (status in ('Available', 'Reserved', 'Rented', 'Inactive'));

create table if not exists public.property_applications (
  application_id bigint generated always as identity primary key,
  property_id bigint not null references public.properties(property_id) on delete cascade,
  tenant_id bigint not null references public.tenants(tenant_id) on delete cascade,
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

create index if not exists idx_property_applications_property on public.property_applications(property_id);
create index if not exists idx_property_applications_tenant on public.property_applications(tenant_id);
create index if not exists idx_property_applications_status on public.property_applications(status);

alter table if exists public.property_applications enable row level security;

drop policy if exists property_applications_select_anon on public.property_applications;
create policy property_applications_select_anon
on public.property_applications
for select
to anon, authenticated
using (true);

drop policy if exists property_applications_insert_anon on public.property_applications;
create policy property_applications_insert_anon
on public.property_applications
for insert
to anon, authenticated
with check (true);

drop policy if exists property_applications_update_anon on public.property_applications;
create policy property_applications_update_anon
on public.property_applications
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists property_applications_delete_anon on public.property_applications;
create policy property_applications_delete_anon
on public.property_applications
for delete
to anon, authenticated
using (true);
