# Пайплайн данных каталога профессий

> Как наполнять и обновлять каталог: от O*NET и рынка РФ до Supabase. Реализует
> Фазу 1 ([plan/phase-1-data-catalog.md](../plan/phase-1-data-catalog.md)).

## Источник истины

- **MVP:** `data/catalog.json` — курируемый каталог (сейчас 39 ролей, наём + своё
  дело). Приложение читает его напрямую.
- **Прод:** таблицы Supabase `occupations` / `income_profiles` / `skills` …
  (схема в `migrations/0001_init.sql`). Каталог загружается из JSON загрузчиком.

## Скрипты (в `scripts/`)

| Скрипт | npm | Что делает | Нужно |
|--------|-----|-----------|-------|
| `validate-catalog.mjs` | `npm run catalog:validate` | проверяет полноту и корректность `catalog.json` | — |
| `onet-import.mjs` | `npm run catalog:import-onet` | тянет профессии + RIASEC из O*NET → `data/onet-catalog.json` | `ONET_USERNAME`, `ONET_PASSWORD` |
| `load-to-supabase.mjs` | `npm run catalog:load` | upsert `catalog.json` → Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

## Полный процесс наполнения (Фаза 1)

1. **Импорт скелета из O*NET** (бесплатная регистрация на
   services.onetcenter.org → логин/пароль разработчика):
   ```bash
   ONET_USERNAME=... ONET_PASSWORD=... npm run catalog:import-onet -- --limit=200
   ```
   Получаем `data/onet-catalog.json`: title (EN), RIASEC-коды и баллы, грубый тип
   Климова. **Нет:** зарплат РФ, локализации, флагов самозанятости.

2. **Локализация и обогащение** (ручное + AI-ассист):
   - Перевести `title`, написать `summary` и `day_in_life` на русском.
   - Проставить `employment_modes` (где возможна самозанятость — добавить
     freelance/business), `work_context`, `first_action`.
   - Уточнить `klimov_type` (эвристика из RIASEC — черновая).

3. **Доход и спрос (рынок РФ)** — из hh.ru (зарплаты/вакансии), Avito Услуги и
   Profi.ru (самозанятость), Upwork/Fiverr (цифровой фриланс):
   - Заполнить `income` (диапазоны по каждому `employment_mode`) и `demand_level`.
   - Хранить `source` и дату (данные быстро устаревают).

4. **Добавить роли самозанятости**, которых нет в O*NET (ремёсла, контент,
   локальные услуги, маркетплейсы) — вручную в `catalog.json`.

5. **Валидация:**
   ```bash
   npm run catalog:validate
   ```
   Должно быть 0 ошибок; проверить покрытие всех 6 типов RIASEC и наличие
   вариантов самозанятости.

6. **Загрузка в Supabase** (после применения миграций к проекту):
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run catalog:load
   ```

## Применение схемы к Supabase

Применить по порядку (через Supabase SQL Editor, CLI или MCP `apply_migration`):
`0001_init.sql` → `0002_seed_example.sql` → `0003_seed_catalog.sql`. Затем —
`load-to-supabase.mjs` для синхронизации расширенного `catalog.json`.

## Обновление данных (Фаза 8)

Зарплаты и спрос периодически переобновлять из hh/Avito; `updated_at`/`source`
в `income_profiles` помогают отслеживать свежесть.

## Лицензии

- O*NET — открытая лицензия с атрибуцией (onetonline.org/help/license).
- hh/Avito/Upwork — проверить ToS/официальные API перед массовым сбором; хранить
  только агрегированные ориентиры дохода.
