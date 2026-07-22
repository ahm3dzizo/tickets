import path from "path";
import { fileURLToPath } from "url";
import 'dotenv/config';

const __filename_global = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename_global);

export const PORT = 3001;
export const FIREBASE_PROJECT_ID = "tickets-f4541";
export const APP_JWT_SECRET = process.env.APP_JWT_SECRET || "retal-local-dev-secret";


export const USER_ROLES = new Set(["admin", "engineer", "supervisor"]);
export const USER_SPECIALTIES = new Set(["mechanics", "electricity", "general"]);

export const VALID_TYPES = [
  "plumbing", "electricity", "doors_windows", "cracks", "ceramics",
  "drainage", "ac_ventilation", "pumps",
  "waterproofing", "grading", "pest_control", "cleaning", "structural",
  "paints", "doors",
  "tank_neck", "tank_cover", "tank_broken",
  "smells",
];

export const CONFLICTING_PAIRS: [string, string][] = [
  // كهرباء لا تجتمع مع أنواع المياه
  ["electricity", "plumbing"],
  ["electricity", "drainage"],
  ["electricity", "pumps"],
  ["electricity", "ac_ventilation"],
  ["electricity", "waterproofing"],
  ["electricity", "grading"],
  ["electricity", "pest_control"],
  ["electricity", "structural"],
  ["electricity", "tank_neck"],
  ["electricity", "tank_cover"],
  ["electricity", "tank_broken"],
  ["plumbing", "electricity"],
  ["doors_windows", "electricity"],
  // أبواب ونوافذ لا تجتمع مع السباكة (الأعلى score يكسب)
  ["doors_windows", "plumbing"],
  ["doors_windows", "drainage"],
  ["doors_windows", "grading"],
  ["doors_windows", "waterproofing"],
  ["doors_windows", "tank_neck"],
  ["doors_windows", "tank_cover"],
  ["doors_windows", "tank_broken"],
  ["doors_windows", "pumps"],
  // السباكة لا تجتمع مع الأبواب
  ["plumbing", "doors_windows"],
  ["cracks", "pest_control"],
  ["cleaning", "structural"],
];
