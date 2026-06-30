// Валидатор каталога профессий. Запуск: node scripts/validate-catalog.mjs
// Проверяет полноту и корректность data/catalog.json (см. plan/phase-1).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, "..", "data", "catalog.json");

const RIASEC = ["R", "I", "A", "S", "E", "C"];
const KLIMOV = ["tech", "human", "sign", "art", "nature"];
const MODES = ["employee", "freelance", "business", "hybrid"];
const CONTEXT = ["remote", "office", "hands", "with_people", "solo", "team"];
const DEMAND = ["low", "medium", "high"];

const data = JSON.parse(readFileSync(path, "utf8"));
const errors = [];
const warnings = [];
const slugs = new Set();

let selfEmploymentCount = 0;
const riasecCoverage = Object.fromEntries(RIASEC.map((k) => [k, 0]));

for (const [i, o] of data.entries()) {
  const id = o.slug || `#${i}`;
  const req = ["slug", "title", "summary", "day_in_life", "riasec_code", "riasec_scores", "klimov_type", "employment_modes", "work_context", "demand_level", "income"];
  for (const f of req) if (o[f] == null) errors.push(`${id}: нет поля ${f}`);

  if (o.slug) {
    if (slugs.has(o.slug)) errors.push(`${id}: дубликат slug`);
    slugs.add(o.slug);
  }

  if (o.riasec_scores) {
    for (const k of RIASEC) {
      const v = o.riasec_scores[k];
      if (typeof v !== "number" || v < 0 || v > 100) errors.push(`${id}: riasec_scores.${k} вне 0..100`);
    }
    const top = Math.max(...RIASEC.map((k) => o.riasec_scores[k] ?? 0));
    if (top < 50) warnings.push(`${id}: слабый доминирующий RIASEC (top=${top})`);
    // покрытие: считаем доминирующий тип
    const dom = RIASEC.reduce((a, k) => (o.riasec_scores[k] > o.riasec_scores[a] ? k : a), "R");
    riasecCoverage[dom]++;
  }

  if (o.klimov_type && !KLIMOV.includes(o.klimov_type)) errors.push(`${id}: неизвестный klimov_type ${o.klimov_type}`);

  if (Array.isArray(o.employment_modes)) {
    if (!o.employment_modes.length) errors.push(`${id}: пустой employment_modes`);
    for (const m of o.employment_modes) if (!MODES.includes(m)) errors.push(`${id}: неизвестный mode ${m}`);
    if (o.employment_modes.some((m) => m === "freelance" || m === "business")) selfEmploymentCount++;
  }

  if (Array.isArray(o.work_context))
    for (const c of o.work_context) if (!CONTEXT.includes(c)) errors.push(`${id}: неизвестный work_context ${c}`);

  if (o.demand_level && !DEMAND.includes(o.demand_level)) errors.push(`${id}: неизвестный demand_level ${o.demand_level}`);

  if (Array.isArray(o.income)) {
    if (!o.income.length) errors.push(`${id}: нет income`);
    for (const inc of o.income) {
      if (!(inc.income_low <= inc.income_median && inc.income_median <= inc.income_high))
        errors.push(`${id}: income low<=median<=high нарушено`);
      if (!MODES.includes(inc.employment_mode)) errors.push(`${id}: income.employment_mode неизвестен`);
    }
  }

  if (!o.first_action) warnings.push(`${id}: нет first_action`);
}

console.log(`Профессий: ${data.length}`);
console.log(`С вариантом самозанятости (freelance/business): ${selfEmploymentCount}`);
console.log(`Покрытие RIASEC (по доминанте):`, riasecCoverage);
console.log(`Предупреждений: ${warnings.length}`);
if (warnings.length) warnings.forEach((w) => console.log("  ⚠ " + w));

if (errors.length) {
  console.error(`\n❌ Ошибок: ${errors.length}`);
  errors.forEach((e) => console.error("  • " + e));
  process.exit(1);
}
console.log("\n✅ Каталог валиден");
