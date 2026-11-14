-- =====================================================
-- FENOMENAL FEN BİLİMLERİ - YENİ ŞEMA (v2)
-- =====================================================

-- 5. Ders İçerikleri
drop table if exists lesson_contents cascade;

create table lesson_contents (
    id uuid default gen_random_uuid() primary key,
    grade text not null,
    unit_name text not null,
    section_name text not null,
    content_type text not null,
    title text not null,
    description text default '',
    file_url text,
    file_path text,
    experiment_url text,
    quiz_data jsonb default '[]'::jsonb,
    sort_order integer default 0,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_lesson_contents_grade on lesson_contents(grade);
create index if not exists idx_lesson_contents_unit on lesson_contents(grade, unit_name);
create index if not exists idx_lesson_contents_section on lesson_contents(grade, unit_name, section_name);
create index if not exists idx_lesson_contents_type on lesson_contents(content_type);

-- 6. Öğrenci İlerleme Takibi
drop table if exists student_progress cascade;

create table student_progress (
    id uuid default gen_random_uuid() primary key,
    student_id uuid references students(id) on delete cascade,
    grade text not null,
    branch text not null,
    school_no integer not null,
    content_id uuid references lesson_contents(id) on delete cascade,
    is_completed boolean default false,
    completed_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(student_id, content_id)
);

create index if not exists idx_student_progress_student on student_progress(student_id);
create index if not exists idx_student_progress_content on student_progress(content_id);

-- 7. Quiz Sonuçları
drop table if exists quiz_results cascade;

create table quiz_results (
    id uuid default gen_random_uuid() primary key,
    student_id uuid references students(id) on delete cascade,
    content_id uuid references lesson_contents(id) on delete cascade,
    grade text not null,
    branch text not null,
    school_no integer not null,
    answers jsonb default '{}'::jsonb,
    correct_count integer default 0,
    total_questions integer default 0,
    score numeric(5,2) default 0,
    time_spent_seconds integer default 0,
    is_finished boolean default false,
    started_at timestamp with time zone default timezone('utc'::text, now()),
    finished_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_quiz_results_student on quiz_results(student_id);
create index if not exists idx_quiz_results_content on quiz_results(content_id);

-- 8. Rapor Şablonları
create table if not exists report_templates (
    id uuid default gen_random_uuid() primary key,
    grade text not null,
    unit_name text not null,
    section_name text not null,
    report_text text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table lesson_contents enable row level security;
alter table student_progress enable row level security;
alter table quiz_results enable row level security;

create policy "lesson_contents_select" on lesson_contents for select using (true);
create policy "student_progress_select" on student_progress for select using (true);
create policy "quiz_results_select" on quiz_results for select using (true);

create policy "lesson_contents_insert" on lesson_contents for insert with check (true);
create policy "lesson_contents_update" on lesson_contents for update using (true);
create policy "lesson_contents_delete" on lesson_contents for delete using (true);

create policy "student_progress_insert" on student_progress for insert with check (true);
create policy "student_progress_update" on student_progress for update using (true);

create policy "quiz_results_insert" on quiz_results for insert with check (true);
create policy "quiz_results_update" on quiz_results for update using (true);

-- İlerleme fonksiyonu
create or replace function get_section_progress(
    p_student_id uuid,
    p_grade text,
    p_unit text,
    p_section text
)
returns numeric as $$
declare
    total_count integer;
    completed_count integer;
begin
    select count(*) into total_count
    from lesson_contents
    where grade = p_grade
      and unit_name = p_unit
      and section_name = p_section
      and is_active = true;

    if total_count = 0 then
        return 0;
    end if;

    select count(*) into completed_count
    from student_progress sp
    join lesson_contents lc on lc.id = sp.content_id
    where sp.student_id = p_student_id
      and sp.is_completed = true
      and lc.grade = p_grade
      and lc.unit_name = p_unit
      and lc.section_name = p_section
      and lc.is_active = true;

    return round((completed_count::numeric / total_count::numeric) * 100, 1);
end;
$$ language plpgsql;
