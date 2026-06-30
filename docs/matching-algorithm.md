# Алгоритм матчинга: профиль → каталог профессий

> Как из `sessions.profile` получить ранжированный список конкретных профессий,
> включая своё дело. Запускается, когда бот шлёт `needs_catalog_query`, и при
> финале (этап wrapup).

---

## Вход / выход

**Вход:** `user_profile` (riasec_scores, skills, values, constraints, big_five),
опц. фильтры из `needs_catalog_query`.
**Выход:** топ-N `occupations` со score, разнесённые по `employment_mode`, с
`rationale` (почему подходит) и `first_action`.

---

## Формула скоринга

```
score(occ, profile) =
    0.30 * riasec_similarity(profile.riasec_scores, occ.riasec_scores)
  + 0.20 * skills_overlap(profile.skills, occ.occupation_skills)
  + 0.20 * format_match(profile.constraints, occ.work_context, occ.employment_modes)
  + 0.15 * income_fit(profile.constraints, occ.income_profiles)
  + 0.10 * values_overlap(profile.values, occ.occupation_values)
  + 0.05 * demand_bonus(occ.demand_level)
  - penalty_big_five(profile.big_five_signals, occ.big_five_fit)
```

Веса — стартовые, выносим в конфиг и калибруем на обратной связи пользователей.

### Компоненты

**riasec_similarity** — косинусное сходство двух 6-мерных векторов
`{R,I,A,S,E,C}`, нормированных 0–1. Главный сигнал интересов.

**skills_overlap** — доля важных навыков профессии, покрытых навыками
пользователя, с весом по `importance`. **Бонус, не фильтр:** непокрытые навыки с
`learnable=true` не штрафуют, а идут в `entry_path` («что освоить»). Навыки с
`paid=true` у пользователя дают доп-бонус для своего дела.

**format_match** — совпадение `constraints.format` с `occ.work_context` и
`occ.employment_modes`. Если пользователь хочет `solo/remote/business`, а
профессия это поддерживает — высокий балл; жёсткое противоречие (хочет remote,
роль только hands-on на месте) — близко к 0.

**income_fit** — накрывает ли диапазон `income_profiles` ожидания пользователя:
```
1.0  если income_high >= income_goal
0.6  если income_high в [income_floor, income_goal)
0.2  если income_high < income_floor
```
Считается по релевантному `employment_mode`.

**values_overlap** — пересечение `values` пользователя и `occupation_values`,
взвешенное.

**penalty_big_five** — штраф за явный конфликт (напр. `extraversion:low` +
профессия, где `extraversion:"helps"` критично, как холодные продажи).

---

## Разнообразие выдачи (важно!)

Нельзя выдать 5 похожих ролей. После скоринга:
1. Взять топ кандидатов.
2. Гарантировать в финальной пятёрке представительство **разных
   `employment_mode`**: минимум один `employee`, один `freelance/business`, и по
   возможности один `hybrid`.
3. Не более 2 профессий с одинаковым доминирующим RIASEC-типом.
4. Подмешать 1 «расширяющий горизонт» вариант из `occupation_relations`
   (`alternative_mode` / `adjacent`), которого человек мог не рассматривать.

---

## Псевдокод

```python
def match(profile, filters=None, n=5):
    cands = catalog.query(
        riasec_top=top3(profile.riasec_scores),
        modes=profile.constraints.format_modes,   # мягкий фильтр-предотбор
        active=True,
    )
    scored = [(occ, score(occ, profile)) for occ in cands]
    scored.sort(key=lambda x: -x[1])
    picks = diversify(scored, by_mode=True, max_per_riasec=2, n=n-1)
    picks += pick_horizon_expander(profile, exclude=picks)   # +1 расширяющий
    for occ, s in picks:
        occ.rationale = explain(occ, profile)   # ссылки на ответы пользователя
        occ.first_action = best_entry_path(occ, profile).first_action
    return picks
```

**explain()** формирует «почему вам»: совпавшие интересы (RIASEC), какие навыки
уже есть, как сходится по формату/доходу/ценностям. Это и есть `rationale` в
`recommendations`.

---

## Холодный старт и пробелы

- Профиль ещё бедный (мало данных) → не финализировать; вернуть боту сигнал
  «нужны ещё вопросы» (не `ready_to_finalize`).
- Нет подходящих по доходу → честно показать ближайшие + путь роста дохода
  (entry_path к более оплачиваемому варианту/режиму).
- Навыков нет совсем → ранжировать по интересам+формату, опираясь на
  `learnable`-пути входа.

---

## Калибровка

Логировать реакцию пользователя на гипотезы (`recommendations.reaction`) и
использовать как сигнал для подстройки весов: если роли с высоким score часто
получают `negative` по одной причине — корректировать соответствующий компонент.
