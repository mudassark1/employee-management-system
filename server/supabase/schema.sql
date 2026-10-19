create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null unique,
  password_hash text not null,
  role text not null default 'employee' check (role in ('admin', 'hr', 'employee')),
  session_version integer not null default 0,
  reset_password_token text,
  reset_password_expires timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  email text not null unique,
  phone text not null default '',
  department text not null,
  position text not null,
  employment_type text not null default 'Full-time'
    check (employment_type in ('Full-time', 'Part-time', 'Contract', 'Intern')),
  status text not null default 'Active' check (status in ('Active', 'On leave', 'Inactive')),
  salary numeric not null default 0 check (salary >= 0),
  start_date date not null,
  avatar_color text not null default '#e7eafe',
  user_id uuid unique references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  check_in timestamptz not null,
  check_out timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_employee_date_unique unique (employee_id, date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  type text not null check (type in ('Annual leave', 'Sick leave', 'Personal leave', 'Unpaid leave')),
  start_date date not null,
  end_date date not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_dates_ordered check (end_date >= start_date)
);

create index if not exists employees_user_id_idx on public.employees(user_id);
create index if not exists attendance_employee_date_idx on public.attendance(employee_id, date desc);
create index if not exists leave_requests_employee_created_idx on public.leave_requests(employee_id, created_at desc);
create index if not exists leave_requests_status_idx on public.leave_requests(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
for each row execute function public.set_updated_at();
drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at before update on public.employees
for each row execute function public.set_updated_at();
drop trigger if exists attendance_set_updated_at on public.attendance;
create trigger attendance_set_updated_at before update on public.attendance
for each row execute function public.set_updated_at();
drop trigger if exists leave_requests_set_updated_at on public.leave_requests;
create trigger leave_requests_set_updated_at before update on public.leave_requests
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
