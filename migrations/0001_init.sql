-- Платформа профориентации: каталог профессий + профиль пользователя
-- PostgreSQL / Supabase. См. docs/database-schema.md

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- нечёткий поиск по названиям

-- ───────────────────────────────────────────────────────────────────────────
-- СПРАВОЧНИКИ
-- ───────────────────────────────────────────────────────────────────────────

-- Навыки (общие/транс­ферные). Один навык связывает много профессий.
create table skills (
    id           bigserial primary key,
    name         text not null unique,
    category     text,                         -- digital | communication | craft | analytical | management | creative ...
    transferable boolean not null default true,
    esco_uri     text,                          -- связь с ESCO
    created_at   timestamptz not null default now()
);

-- Ценности / мотиваторы (для матчинга по ценностям и пути Ikigai).
create table values_dim (
    id          bigserial primary key,
    name        text not null unique,           -- "свобода графика", "помощь людям", "стабильность", "творчество" ...
    description text
);

-- ───────────────────────────────────────────────────────────────────────────
-- КАТАЛОГ ПРОФЕССИЙ
-- ───────────────────────────────────────────────────────────────────────────

create table occupations (
    id               bigserial primary key,
    title            text not null,                       -- КОНКРЕТНАЯ роль, не направление
    slug             text unique,
    summary          text,                                -- 1-2 фразы, чем занимается
    day_in_life      text,                                -- "день из жизни" для подачи примером
    granularity      text not null default 'occupation'
                     check (granularity in ('field','occupation','specialization')),

    -- Профориентационные теги
    riasec_code      text,                                -- напр. 'SAE' (1-3 доминирующих)
    riasec_scores    jsonb not null default '{}'::jsonb,  -- {"R":0,"I":40,"A":70,"S":85,"E":50,"C":20}
    klimov_type      text check (klimov_type in ('tech','human','sign','art','nature')),
    big_five_fit     jsonb not null default '{}'::jsonb,  -- {"extraversion":"helps","openness":"helps","neuroticism":"hurts"}

    -- Формат занятости (наём и своё дело равноправны)
    employment_modes text[] not null default '{}',        -- {employee, freelance, business, hybrid}
    work_context     text[] not null default '{}',        -- {remote, office, hands, with_people, solo, team}

    -- Рынок
    demand_level     text check (demand_level in ('low','medium','high')),

    -- Связь с внешними таксономиями
    onet_code        text,
    esco_uri         text,

    is_active        boolean not null default true,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index occupations_riasec_gin   on occupations using gin (riasec_scores);
create index occupations_modes_gin    on occupations using gin (employment_modes);
create index occupations_context_gin  on occupations using gin (work_context);
create index occupations_title_trgm   on occupations using gin (title gin_trgm_ops);

-- Профессия ↔ навык (навык = бонус при матчинге, не фильтр)
create table occupation_skills (
    occupation_id bigint not null references occupations(id) on delete cascade,
    skill_id      bigint not null references skills(id)      on delete cascade,
    importance    smallint not null default 3 check (importance between 1 and 5),
    learnable     boolean not null default true,            -- можно освоить с нуля при входе
    primary key (occupation_id, skill_id)
);

-- Профессия ↔ ценность
create table occupation_values (
    occupation_id bigint not null references occupations(id) on delete cascade,
    value_id      bigint not null references values_dim(id)  on delete cascade,
    weight        smallint not null default 3 check (weight between 1 and 5),
    primary key (occupation_id, value_id)
);

-- Модели дохода: у одной роли доход разный в найме и в своём деле
create table income_profiles (
    id              bigserial primary key,
    occupation_id   bigint not null references occupations(id) on delete cascade,
    employment_mode text not null check (employment_mode in ('employee','freelance','business','hybrid')),
    pay_model       text  check (pay_model in ('salary','hourly','per_project','subscription','product','royalties','mixed')),
    currency        text not null default 'RUB',
    income_low      numeric,                                 -- нижняя граница (мес.)
    income_median   numeric,
    income_high     numeric,
    period          text not null default 'month' check (period in ('hour','month','project','year')),
    margin_note     text,                                    -- напр. "цифровые услуги: маржа 80-94%"
    source          text,                                    -- hh.ru | Avito | Upwork | O*NET ...
    updated_at      timestamptz not null default now()
);

create index income_profiles_occ on income_profiles(occupation_id);

-- Пути входа: что освоить, за какой срок, вложения, первый шаг
create table entry_paths (
    id              bigserial primary key,
    occupation_id   bigint not null references occupations(id) on delete cascade,
    employment_mode text check (employment_mode in ('employee','freelance','business','hybrid')),
    title           text not null,                           -- "Войти как онлайн-репетитор"
    steps           jsonb not null default '[]'::jsonb,      -- ["освоить X","собрать 3 работы","выйти на биржу"]
    time_estimate   text,                                    -- "1-3 месяца"
    upfront_cost    numeric,                                 -- минимальные вложения
    cost_currency   text default 'RUB',
    first_action    text,                                    -- одно действие "на эту неделю"
    difficulty      text check (difficulty in ('low','medium','high'))
);

create index entry_paths_occ on entry_paths(occupation_id);

-- Смежные/соседние профессии (для расширения горизонта и контраст-вариантов)
create table occupation_relations (
    occupation_id  bigint not null references occupations(id) on delete cascade,
    related_id     bigint not null references occupations(id) on delete cascade,
    relation_type  text not null default 'adjacent'
                   check (relation_type in ('adjacent','alternative_mode','step_up','similar_skills')),
    primary key (occupation_id, related_id, relation_type),
    check (occupation_id <> related_id)
);

-- ───────────────────────────────────────────────────────────────────────────
-- ДВИЖОК ДИАЛОГА
-- ───────────────────────────────────────────────────────────────────────────

-- Банк вопросов для адаптивного выбора (см. dialogue-script.md)
create table questions (
    id          bigserial primary key,
    stage       text not null check (stage in
                 ('rapport','interests','skills','values','hypotheses','reality_check','business','wrapup')),
    text        text not null,
    intent      text,                                    -- что извлекаем: riasec | skills | income | format ...
    source      text,                                    -- RIASEC | CCI | Ikigai | MI | Klimov | Solopreneur
    follow_up   boolean not null default false,
    priority    smallint not null default 3,
    is_active   boolean not null default true
);

-- ───────────────────────────────────────────────────────────────────────────
-- ПОЛЬЗОВАТЕЛИ И СЕССИИ
-- ───────────────────────────────────────────────────────────────────────────

create table users (
    id          uuid primary key default gen_random_uuid(),
    email       text unique,
    display_name text,
    life_stage  text,                                    -- school|student|employed|career_change|burnout|unemployed|wants_business
    created_at  timestamptz not null default now()
);

-- Сессия диалога: profile (JSONB) — единый источник состояния (см. сценарий)
create table sessions (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references users(id) on delete set null,
    stage       text not null default 'rapport',
    profile     jsonb not null default '{}'::jsonb,      -- user_profile из сценария
    confidence  numeric not null default 0,
    status      text not null default 'active' check (status in ('active','completed','abandoned')),
    started_at  timestamptz not null default now(),
    completed_at timestamptz
);

create index sessions_user on sessions(user_id);
create index sessions_profile_gin on sessions using gin (profile);

-- Реплики диалога
create table messages (
    id          bigserial primary key,
    session_id  uuid not null references sessions(id) on delete cascade,
    role        text not null check (role in ('user','assistant','system')),
    content     text not null,
    question_id bigint references questions(id),         -- если реплика — вопрос из банка
    meta        jsonb not null default '{}'::jsonb,      -- извлечённые теги/сигналы из ответа
    created_at  timestamptz not null default now()
);

create index messages_session on messages(session_id, created_at);

-- Выданные гипотезы/результаты с реакцией пользователя
create table recommendations (
    id            bigserial primary key,
    session_id    uuid not null references sessions(id) on delete cascade,
    occupation_id bigint references occupations(id) on delete set null,
    title         text not null,                          -- на случай сгенерированной вне каталога роли
    employment_mode text check (employment_mode in ('employee','freelance','business','hybrid')),
    score         numeric,                                -- результат матчинга
    rank          smallint,
    reaction      text check (reaction in ('positive','interested_but','negative','pending')),
    objection     text,                                   -- что смущает (для адресации)
    status        text not null default 'alive' check (status in ('alive','dropped','final')),
    rationale     text,                                   -- "почему вам подходит" (со ссылкой на ответы)
    first_action  text,                                   -- первый шаг на эту неделю
    created_at    timestamptz not null default now()
);

create index recommendations_session on recommendations(session_id);

-- updated_at автообновление для occupations
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger occupations_updated_at before update on occupations
    for each row execute function set_updated_at();
