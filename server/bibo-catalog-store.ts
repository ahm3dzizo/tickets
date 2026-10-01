import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { MEDIA_ROOT, resolveMediaFile } from "./media-library.js";
import { BIBO_CATALOG_SEEDS } from "./bibo-catalog-seed.js";

export const BIBO_CATALOG_FILE = path.join(MEDIA_ROOT, "products.xlsx");

export type BiboVariantValue = {
  id: string;
  label: string;
  priceOverride: number | null;
};

export type BiboVariantAttribute = {
  id: string;
  name: string;
  values: BiboVariantValue[];
};

export type BiboCatalogProduct = {
  id: string;
  name: string;
  description: string;
  variants: string;
  variantAttributes: BiboVariantAttribute[];
  price: number | null;
  currency: string;
  images: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

let writeQueue: Promise<unknown> = Promise.resolve();

export function queueCatalogWrite<T>(work: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(work, work);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

export async function waitForCatalogWrites() {
  await writeQueue;
}

function cellText(value: ExcelJS.CellValue | null | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result !== undefined) return String(value.result ?? "");
  }
  return String(value);
}

function toPrice(value: ExcelJS.CellValue | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = cellText(value).replace(/,/g, "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function imageIdFromName(name: string) {
  const match = name.match(/_(\d+)\.(?:jpe?g|png|webp|gif)$/i);
  return match ? Number(match[1]) : null;
}

async function availableSeedImages() {
  const entries = await fs.promises.readdir(MEDIA_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:jpe?g|png|webp|gif)$/i.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => name !== "Hedaya-Logo.png");
}

function imagesForSeed(files: string[], seed: (typeof BIBO_CATALOG_SEEDS)[number]) {
  const ids = new Set(seed.imageIds ?? []);
  return files.filter((file) => {
    const id = imageIdFromName(file);
    if (!id) return false;
    if (ids.has(id)) return true;
    return (seed.ranges ?? []).some(([start, end]) => id >= start && id <= end);
  });
}

function legacyAttributes(variants: string): BiboVariantAttribute[] {
  const raw = variants.trim();
  if (!raw) return [];

  const values: BiboVariantValue[] = raw
    .split(/[|،,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 40)
    .map((label) => ({
      id: randomUUID(),
      label,
      priceOverride: null,
    }));

  return values.length
    ? [{ id: randomUUID(), name: "خيارات", values }]
    : [];
}

export function summarizeVariantAttributes(attributes: BiboVariantAttribute[]) {
  return attributes
    .filter((attribute) => attribute.name && attribute.values.length)
    .map((attribute) =>
      `${attribute.name}: ${attribute.values.map((value) => value.label).join("، ")}`,
    )
    .join(" | ");
}

export function sanitizeVariantAttributes(input: unknown): BiboVariantAttribute[] {
  if (!Array.isArray(input)) return [];

  const result: BiboVariantAttribute[] = [];
  const usedNames = new Set<string>();

  for (const raw of input.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;

    const name =
      typeof (raw as any).name === "string"
        ? (raw as any).name.trim().slice(0, 80)
        : "";
    if (!name) continue;

    const normalizedName = name.toLocaleLowerCase("ar");
    if (usedNames.has(normalizedName)) continue;
    usedNames.add(normalizedName);

    const sourceValues = Array.isArray((raw as any).values)
      ? (raw as any).values
      : [];

    const seenValues = new Set<string>();
    const values: BiboVariantValue[] = [];

    for (const rawValue of sourceValues.slice(0, 60)) {
      const legacyLabel =
        typeof rawValue === "string" ? rawValue.trim().slice(0, 120) : "";

      const objectLabel =
        rawValue && typeof rawValue === "object" && typeof (rawValue as any).label === "string"
          ? (rawValue as any).label.trim().slice(0, 120)
          : "";

      const label = objectLabel || legacyLabel;
      if (!label) continue;

      const key = label.toLocaleLowerCase("ar");
      if (seenValues.has(key)) continue;
      seenValues.add(key);

      const rawOverride =
        rawValue && typeof rawValue === "object"
          ? (rawValue as any).priceOverride
          : null;

      let priceOverride: number | null = null;
      if (rawOverride !== null && rawOverride !== undefined && rawOverride !== "") {
        const parsed = Number(rawOverride);
        if (Number.isFinite(parsed) && parsed >= 0) {
          priceOverride = Math.round(parsed * 100) / 100;
        }
      }

      values.push({
        id:
          rawValue &&
          typeof rawValue === "object" &&
          typeof (rawValue as any).id === "string" &&
          (rawValue as any).id.trim()
            ? (rawValue as any).id.trim().slice(0, 80)
            : randomUUID(),
        label,
        priceOverride,
      });
    }

    if (!values.length) continue;

    result.push({
      id:
        typeof (raw as any).id === "string" && (raw as any).id.trim()
          ? (raw as any).id.trim().slice(0, 80)
          : randomUUID(),
      name,
      values,
    });
  }

  return result;
}

export async function writeCatalogProducts(products: BiboCatalogProduct[]) {
  await fs.promises.mkdir(MEDIA_ROOT, { recursive: true });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hedaya Catalog";
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Products", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "ID", key: "id", width: 18 },
    { header: "الاسم", key: "name", width: 34 },
    { header: "الوصف", key: "description", width: 56 },
    { header: "ملخص المتغيرات", key: "variants", width: 46 },
    { header: "السعر", key: "price", width: 14 },
    { header: "العملة", key: "currency", width: 12 },
    { header: "الصور", key: "images", width: 80 },
    { header: "الترتيب", key: "sortOrder", width: 12 },
    { header: "تاريخ الإنشاء", key: "createdAt", width: 25 },
    { header: "آخر تعديل", key: "updatedAt", width: 25 },
    { header: "المتغيرات المنظمة JSON", key: "variantAttributes", width: 80 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { horizontal: "center", vertical: "middle" };

  for (const product of [...products].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const variantAttributes = sanitizeVariantAttributes(product.variantAttributes);
    const variants = summarizeVariantAttributes(variantAttributes) || product.variants || "";

    const row = sheet.addRow({
      ...product,
      variants,
      variantAttributes: JSON.stringify(variantAttributes),
      price: product.price ?? "",
      images: JSON.stringify(product.images),
    });
    row.alignment = { vertical: "top", wrapText: true };
  }

  sheet.autoFilter = { from: "A1", to: "K1" };

  const variantsSheet = workbook.addWorksheet("Variants", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  variantsSheet.columns = [
    { header: "Product ID", key: "productId", width: 20 },
    { header: "اسم المنتج", key: "productName", width: 34 },
    { header: "الخاصية", key: "attributeName", width: 24 },
    { header: "القيمة", key: "value", width: 28 },
    { header: "السعر الأساسي", key: "basePrice", width: 16 },
    { header: "سعر مخصص", key: "priceOverride", width: 16 },
    { header: "السعر النهائي", key: "effectivePrice", width: 16 },
    { header: "نظام السعر", key: "priceMode", width: 18 },
    { header: "ترتيب الخاصية", key: "attributeOrder", width: 16 },
    { header: "ترتيب القيمة", key: "valueOrder", width: 16 },
  ];

  const variantsHeader = variantsSheet.getRow(1);
  variantsHeader.font = { bold: true };
  variantsHeader.alignment = { horizontal: "center", vertical: "middle" };

  for (const product of [...products].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const attributes = sanitizeVariantAttributes(product.variantAttributes);
    attributes.forEach((attribute, attributeIndex) => {
      attribute.values.forEach((value, valueIndex) => {
        const effectivePrice = value.priceOverride ?? product.price;
        variantsSheet.addRow({
          productId: product.id,
          productName: product.name,
          attributeName: attribute.name,
          value: value.label,
          basePrice: product.price ?? "",
          priceOverride: value.priceOverride ?? "",
          effectivePrice: effectivePrice ?? "",
          priceMode: value.priceOverride === null ? "السعر الأساسي" : "سعر مخصص",
          attributeOrder: attributeIndex + 1,
          valueOrder: valueIndex + 1,
        });
      });
    });
  }

  variantsSheet.autoFilter = { from: "A1", to: "J1" };

  const temp = BIBO_CATALOG_FILE + ".tmp";
  await workbook.xlsx.writeFile(temp);
  await fs.promises.rename(temp, BIBO_CATALOG_FILE);
}

async function createSeedWorkbook() {
  const files = await availableSeedImages();
  const now = new Date().toISOString();

  await writeCatalogProducts(
    BIBO_CATALOG_SEEDS.map((seed, index) => {
      const variantAttributes = legacyAttributes(seed.variants ?? "");
      return {
        id: seed.id,
        name: seed.name,
        description: seed.description,
        variants: summarizeVariantAttributes(variantAttributes),
        variantAttributes,
        price: null,
        currency: "SAR",
        images: imagesForSeed(files, seed),
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      };
    }),
  );
}

export async function ensureCatalogWorkbook() {
  try {
    await fs.promises.access(BIBO_CATALOG_FILE, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    await createSeedWorkbook();
  }
}

export async function readCatalogProductsUnlocked(): Promise<BiboCatalogProduct[]> {
  await ensureCatalogWorkbook();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(BIBO_CATALOG_FILE);
  const sheet = workbook.getWorksheet("Products") ?? workbook.worksheets[0];
  if (!sheet) return [];

  const products: BiboCatalogProduct[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const id = cellText(row.getCell(1).value).trim();
    if (!id) return;

    let images: string[] = [];
    const rawImages = cellText(row.getCell(7).value).trim();
    if (rawImages) {
      try {
        const parsed = JSON.parse(rawImages);
        if (Array.isArray(parsed)) {
          images = parsed.filter((item): item is string => typeof item === "string");
        }
      } catch {
        images = rawImages.split("|").map((item) => item.trim()).filter(Boolean);
      }
    }

    const legacyVariants = cellText(row.getCell(4).value);
    let variantAttributes: BiboVariantAttribute[] = [];

    const rawStructured = cellText(row.getCell(11).value).trim();
    if (rawStructured) {
      try {
        variantAttributes = sanitizeVariantAttributes(JSON.parse(rawStructured));
      } catch {
        variantAttributes = [];
      }
    }

    if (!variantAttributes.length && legacyVariants.trim()) {
      variantAttributes = legacyAttributes(legacyVariants);
    }

    products.push({
      id,
      name: cellText(row.getCell(2).value),
      description: cellText(row.getCell(3).value),
      variants:
        summarizeVariantAttributes(variantAttributes) || legacyVariants,
      variantAttributes,
      price: toPrice(row.getCell(5).value),
      currency: cellText(row.getCell(6).value).trim() || "SAR",
      images,
      sortOrder: Number(cellText(row.getCell(8).value)) || rowNumber - 1,
      createdAt: cellText(row.getCell(9).value) || new Date().toISOString(),
      updatedAt: cellText(row.getCell(10).value) || new Date().toISOString(),
    });
  });

  return products.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function readCatalogProducts() {
  await waitForCatalogWrites();
  return readCatalogProductsUnlocked();
}

export function publicCatalogProduct(product: BiboCatalogProduct) {
  return {
    ...product,
    imageUrls: product.images.map(
      (relativePath) => `/api/media/file?path=${encodeURIComponent(relativePath)}`,
    ),
  };
}

export function cleanCatalogText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function parseCatalogPrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0
    ? Math.round(price * 100) / 100
    : null;
}

export async function validateCatalogImagePaths(input: unknown) {
  if (!Array.isArray(input)) return [];

  const unique = [
    ...new Set(
      input
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];

  if (unique.length > 80) throw new Error("TOO_MANY_IMAGES");

  const valid: string[] = [];
  for (const relativePath of unique) {
    if (relativePath === "Hedaya-Logo.png") continue;
    const resolved = await resolveMediaFile(relativePath);
    if (!resolved.ok) throw new Error("INVALID_IMAGE_PATH");
    valid.push(resolved.relativePath);
  }

  return valid;
}
