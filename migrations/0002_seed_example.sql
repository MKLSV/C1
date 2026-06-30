-- Демонстрационный seed: одна конкретная роль, размеченная по всем осям,
-- с вариантами найма И своего дела. Показывает, как наполнять каталог.
-- См. docs/database-schema.md

-- Навыки
insert into skills (name, category, transferable) values
    ('объяснять сложное простыми словами', 'communication', true),
    ('планирование занятий/методика', 'management', true),
    ('предметная экспертиза (математика)', 'analytical', false),
    ('ведение онлайн-встреч', 'digital', true),
    ('привлечение клиентов / личный бренд', 'management', true)
on conflict (name) do nothing;

-- Ценности
insert into values_dim (name, description) values
    ('помощь людям', 'видеть результат и пользу для другого человека'),
    ('свобода графика', 'самому распоряжаться временем'),
    ('рост дохода', 'потолок заработка зависит от усилий')
on conflict (name) do nothing;

-- Профессия: КОНКРЕТНАЯ роль, не «педагог»
insert into occupations
    (title, slug, summary, day_in_life, granularity, riasec_code, riasec_scores,
     klimov_type, big_five_fit, employment_modes, work_context, demand_level, onet_code)
values
    ('Онлайн-репетитор и методист по математике',
     'online-math-tutor',
     'Готовит школьников к экзаменам онлайн, разрабатывает программы и материалы.',
     'Утром составляет план уроков, днём проводит 3-4 онлайн-занятия, вечером проверяет работы и ведёт соцсети для привлечения учеников.',
     'specialization',
     'SAI',
     '{"R":10,"I":60,"A":40,"S":90,"E":55,"C":35}'::jsonb,
     'human',
     '{"extraversion":"helps","conscientiousness":"helps","openness":"helps"}'::jsonb,
     '{employee,freelance,business,hybrid}',
     '{remote,with_people,solo}',
     'high',
     '25-3021.00')
on conflict (slug) do nothing;

-- Связи навыков (importance 1-5, learnable — можно ли освоить при входе)
insert into occupation_skills (occupation_id, skill_id, importance, learnable)
select o.id, s.id, v.importance, v.learnable
from occupations o
join (values
        ('объяснять сложное простыми словами', 5, false),
        ('предметная экспертиза (математика)', 5, false),
        ('планирование занятий/методика', 4, true),
        ('ведение онлайн-встреч', 3, true),
        ('привлечение клиентов / личный бренд', 4, true)
     ) as v(skill_name, importance, learnable) on true
join skills s on s.name = v.skill_name
where o.slug = 'online-math-tutor'
on conflict do nothing;

-- Ценности
insert into occupation_values (occupation_id, value_id, weight)
select o.id, vd.id, 5
from occupations o, values_dim vd
where o.slug = 'online-math-tutor'
  and vd.name in ('помощь людям','свобода графика','рост дохода')
on conflict do nothing;

-- Модели дохода: наём vs своё дело (разная экономика одной роли)
insert into income_profiles
    (occupation_id, employment_mode, pay_model, currency, income_low, income_median, income_high, period, source)
select o.id, m.mode, m.pay, 'RUB', m.low, m.med, m.high, 'month', m.src
from occupations o
join (values
        ('employee', 'salary',      40000,  70000, 110000, 'школа/онлайн-платформа (hh.ru)'),
        ('freelance','hourly',      60000, 120000, 250000, 'частные ученики (Avito/Profi.ru)'),
        ('business', 'subscription',80000, 200000, 600000, 'своя группа/курс/мини-школа')
     ) as m(mode, pay, low, med, high, src) on true
where o.slug = 'online-math-tutor';

-- Пути входа: разные для найма и для своего дела
insert into entry_paths
    (occupation_id, employment_mode, title, steps, time_estimate, upfront_cost, first_action, difficulty)
select o.id, p.mode, p.title, p.steps::jsonb, p.time_est, p.cost, p.first_action, p.difficulty
from occupations o
join (values
        ('freelance',
         'Старт как частный репетитор',
         '["оформить профиль на Profi.ru/Avito","провести 3 бесплатных пробных","собрать первые отзывы","поднять цену"]',
         '2-4 недели', 0,
         'Завести профиль на одной площадке и предложить пробный урок 3 знакомым', 'low'),
        ('business',
         'Своя мини-школа / групповой курс',
         '["упаковать программу","сделать лендинг","набрать первую группу 5-8 чел","автоматизировать оплату/расписание"]',
         '2-4 месяца', 15000,
         'Опросить 10 потенциальных учеников/родителей о боли и готовности платить', 'medium')
     ) as p(mode, title, steps, time_est, cost, first_action, difficulty) on true
where o.slug = 'online-math-tutor';

-- Банк вопросов (примеры по этапам — см. dialogue-script.md)
insert into questions (stage, text, intent, source, priority) values
    ('rapport',       'Что вас привело? Что сейчас не так с работой или выбором?', 'context', 'MI', 5),
    ('interests',     'Расскажите про занятие, за которым вы теряете счёт времени. Что именно вы там делаете?', 'riasec', 'RIASEC', 5),
    ('interests',     'Кем вы восхищались в детстве и за что именно?', 'identity', 'CCI', 4),
    ('interests',     'За каким контентом вы залипаете — каналы, блоги, видео? О чём они?', 'riasec', 'CCI', 4),
    ('skills',        'Назовите 2-3 вещи, за которые вам уже платили или просили совета в последний год.', 'skills_paid', 'Transferable', 5),
    ('skills',        'Что даётся вам заметно легче, чем большинству вокруг?', 'skills', 'Transferable', 4),
    ('values',        'Сколько денег в месяц для вас "спокойно"? А "отлично"?', 'income', 'Ikigai', 5),
    ('values',        'Что вам ближе: делать руками, головой, с людьми или в одиночку? Наём, фриланс или своё дело?', 'format', 'Ikigai', 5),
    ('reality_check', 'По "[навык] + услуги" заказов сейчас много. Хотите посмотреть, как на этом зарабатывают?', 'demand', 'Solopreneur', 3),
    ('business',      'Кто ваши первые 5-10 клиентов и что у них болит?', 'business_idea', 'Solopreneur', 4),
    ('wrapup',        'Какое из направлений хочется попробовать первым — и что мешает сделать шаг уже на этой неделе?', 'commitment', 'MI', 5)
on conflict do nothing;
