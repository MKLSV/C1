// Загрузка каталога профессий (на MVP — из JSON; в проде — из Supabase).
import catalogData from "../data/catalog.json";
import type { Occupation } from "./types";

export const CATALOG: Occupation[] = catalogData as Occupation[];

export function getBySlug(slug: string): Occupation | undefined {
  return CATALOG.find((o) => o.slug === slug);
}
