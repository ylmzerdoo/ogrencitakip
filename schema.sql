drop table if exists students;

create table students (
    id uuid default gen_random_uuid() primary key,
    grade text not null,
    branch text not null,
    school_no integer not null,
    name text not null,
    plus integer default 0,
    minus integer default 0,
    quiz jsonb default '{}'::jsonb,
    scale jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);