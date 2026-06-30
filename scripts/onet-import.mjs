// Импортёр O*NET Web Services → каркас каталога профессий.
// Тянет список профессий и их интересы (RIASEC), маппит в нашу схему Occupation
// и пишет в data/onet-catalog.json. Доход/локализация добавляются отдельным шагом
// (см. docs/data-pipeline.md), т.к. O*NET не содержит зарплат рынка РФ.
//
// Запуск:
//   ONET_USERNAME=... ONET_PASSWORD=... node scripts/onet-import.mjs [--limit=150]
//
// Регистрация разработчика (бесплатно): https://services.onetcenter.org/
// Базовый URL и аутентификация (Basic) — см. https://services.onetcenter.org/reference/

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "onet-catalog.json");

const BASE = "https://services.onetcenter.org/ws/online";
const USER = process.env.ONET_USERNAME;
const PASS = process.env.ONET_PASSWORD;
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 150);

if (!USER || !PASS) {
  console.error("Нужны ONET_USERNAME и ONET_PASSWORD (регистрация на services.onetcenter.org).");
  process.exit(1);
}

const AUTH = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
const headers = { Authorization: AUTH, Accept: "application/json", "User-Agent": "compas-career/1.0" };

const RIASEC_BY_NAME = {
  Realistic: "R",
  Investigative: "I",
  Artistic: "A",
  Social: "S",
  Enterprising: "E",
  Conventional: "C",
};

async function getJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} @ ${url}`);
  return res.json();
}

// Список профессий (постранично).
async function listOccupations(limit) {
  const out = [];
  let start = 1;
  const page = 50;
  while (out.length < limit) {
    const end = start + page - 1;
    const data = await getJson(`${BASE}/occupations/?start=${start}&end=${end}`);
    const items = data.occupation || [];
    if (!items.length) break;
    out.push(...items);
    if (items.length < page) break;
    start += page;
  }
  return out.slice(0, limit);
}

// Интересы (RIASEC) одной профессии → riasec_scores (0..100) + код.
async function getInterests(code) {
  let data;
  try {
    data = await getJson(`${BASE}/occupations/${code}/details/interests`);
  } catch {
    return null;
  }
  const scores = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  for (const el of data.element || data.interests?.element || []) {
    const key = RIASEC_BY_NAME[el.name];
    if (!key) continue;
    // O*NET data_value интересов обычно по шкале 1..7
    const raw = el.score?.value ?? el.data_value ?? 0;
    scores[key] = Math.round((Number(raw) / 7) * 100);
  }
  const code3 = (data.high_point_code || deriveCode(scores)).toUpperCase();
  return { scores, code: code3 };
}

function deriveCode(scores) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .join("");
}

// Грубая эвристика типа Климова из доминирующего RIASEC (уточняется вручную).
function klimovFromRiasec(scores) {
  const dom = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return { R: "tech", I: "sign", A: "art", S: "human", E: "human", C: "sign" }[dom] || "sign";
}

async function main() {
  console.log(`Тяну до ${LIMIT} профессий из O*NET…`);
  const occs = await listOccupations(LIMIT);
  console.log(`Получено ${occs.length}. Тяну интересы…`);

  const result = [];
  for (const [i, occ] of occs.entries()) {
    const interests = await getInterests(occ.code);
    if (!interests) continue;
    result.push({
      slug: occ.code.replace(/\./g, "-"),
      onet_code: occ.code,
      title: occ.title, // ENG — локализовать отдельно
      summary: "",
      day_in_life: "",
      riasec_code: interests.code,
      riasec_scores: interests.scores,
      klimov_type: klimovFromRiasec(interests.scores),
      employment_modes: ["employee"], // уточнить (самозанятость добавляется вручную)
      work_context: [],
      demand_level: "medium",
      income: [], // доход рынка РФ — отдельный шаг (hh/Avito)
      first_action: "",
      needs_localization: true,
    });
    if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${occs.length}`);
    await new Promise((r) => setTimeout(r, 120)); // вежливый rate limit
  }

  writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n✅ Записано ${result.length} профессий → ${OUT}`);
  console.log("Дальше: локализация (title/day_in_life), доход (hh/Avito), флаги самозанятости. См. docs/data-pipeline.md");
}

main().catch((e) => {
  console.error("Ошибка импорта:", e.message);
  process.exit(1);
});
