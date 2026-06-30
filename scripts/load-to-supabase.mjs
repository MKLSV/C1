// Загрузчик каталога из data/catalog.json в Supabase (таблицы occupations и
// income_profiles, см. migrations/0001_init.sql). Идемпотентный upsert по slug.
//
// Запуск:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/load-to-supabase.mjs
//
// Перед запуском применить миграции (0001..0003) к проекту Supabase.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(__dirname, "..", "data", "catalog.json"), "utf8"));

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  let ok = 0;
  for (const o of catalog) {
    // 1) upsert occupation
    const { data: occRow, error: occErr } = await supabase
      .from("occupations")
      .upsert(
        {
          title: o.title,
          slug: o.slug,
          summary: o.summary,
          day_in_life: o.day_in_life,
          granularity: "specialization",
          riasec_code: o.riasec_code,
          riasec_scores: o.riasec_scores,
          klimov_type: o.klimov_type,
          employment_modes: o.employment_modes,
          work_context: o.work_context,
          demand_level: o.demand_level,
          onet_code: o.onet_code ?? null,
          is_active: true,
        },
        { onConflict: "slug" }
      )
      .select("id")
      .single();

    if (occErr) {
      console.error(`✗ ${o.slug}: ${occErr.message}`);
      continue;
    }

    // 2) перезалить income_profiles этой профессии
    await supabase.from("income_profiles").delete().eq("occupation_id", occRow.id);
    if (o.income?.length) {
      const rows = o.income.map((inc) => ({
        occupation_id: occRow.id,
        employment_mode: inc.employment_mode,
        pay_model: inc.pay_model,
        currency: inc.currency,
        income_low: inc.income_low,
        income_median: inc.income_median,
        income_high: inc.income_high,
        period: inc.period,
        source: inc.source ?? "catalog.json",
      }));
      const { error: incErr } = await supabase.from("income_profiles").insert(rows);
      if (incErr) console.error(`  income ${o.slug}: ${incErr.message}`);
    }
    ok++;
  }
  console.log(`✅ Загружено профессий: ${ok}/${catalog.length}`);
}

main().catch((e) => {
  console.error("Ошибка загрузки:", e.message);
  process.exit(1);
});
