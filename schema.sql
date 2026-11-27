-- Okul, öğretmen ve branş ayrımı
-- Supabase SQL Editor'da bir kez çalıştır.

create table if not exists schools (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    academic_year text default '2025-2026',
    created_at timestamptz default timezone('utc'::text, now())
);

create table if not exists teachers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid unique,
    full_name text not null,
    email text,
    school_id uuid references schools(id) on delete cascade,
    subject text not null,
    is_admin boolean default false,
    created_at timestamptz default timezone('utc'::text, now())
);

alter table branches add column if not exists teacher_id uuid;
alter table branches add column if not exists school_id uuid;
alter table students add column if not exists teacher_id uuid;
alter table students add column if not exists school_id uuid;
alter table units_sections add column if not exists teacher_id uuid;
alter table units_sections add column if not exists school_id uuid;
alter table activities add column if not exists teacher_id uuid;
alter table activities add column if not exists school_id uuid;
alter table lesson_contents add column if not exists teacher_id uuid;
alter table lesson_contents add column if not exists school_id uuid;
alter table report_templates add column if not exists teacher_id uuid;
alter table report_templates add column if not exists school_id uuid;

alter table schools enable row level security;
alter table teachers enable row level security;

drop policy if exists schools_all on schools;
create policy schools_all on schools for all using (true) with check (true);

drop policy if exists teachers_all on teachers;
create policy teachers_all on teachers for all using (true) with check (true);
