import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import {
  BIBO_CATALOG_FILE,
  cleanCatalogText,
  parseCatalogPrice,
  publicCatalogProduct,
  queueCatalogWrite,
  readCatalogProducts,
  readCatalogProductsUnlocked,
  sanitizeVariantAttributes,
  summarizeVariantAttributes,
  validateCatalogImagePaths,
  writeCatalogProducts,
  type BiboCatalogProduct,
} from "../bibo-catalog-store.js";

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

function createProductPayload(input: any, images: string[], sortOrder: number): BiboCatalogProduct {
  const now = new Date().toISOString();
  const variantAttributes = sanitizeVariantAttributes(input?.variantAttributes);

  return {
    id: `product-${randomUUID().slice(0, 8)}`,
    name: cleanCatalogText(input?.name, 200) || "منتج جديد",
    description: cleanCatalogText(input?.description, 4000),
    variants: summarizeVariantAttributes(variantAttributes),
    variantAttributes,
    price: parseCatalogPrice(input?.price),
    currency: "SAR",
    images,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

router.get("/", async (_req, res) => {
  try {
    const products = await readCatalogProducts();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      products: products.map(publicCatalogProduct),
      count: products.length,
      excelUrl: "/api/bibo-catalog/excel",
    });
  } catch (error) {
    console.error("[bibo-catalog] read failed:", error);
    res.status(500).json({ error: "CATALOG_READ_FAILED" });
  }
});

router.get("/excel", async (_req, res) => {
  try {
    const products = await readCatalogProducts();

    await queueCatalogWrite(async () => {
      await writeCatalogProducts(products);
    });

    res.setHeader("Cache-Control", "no-store");
    res.download(BIBO_CATALOG_FILE, "Hedaya-products.xlsx");
  } catch (error) {
    console.error("[bibo-catalog] download failed:", error);
    res.status(500).json({ error: "CATALOG_DOWNLOAD_FAILED" });
  }
});

router.post("/products", writeLimiter, async (req, res) => {
  try {
    const images = await validateCatalogImagePaths(req.body.images);

    const result = await queueCatalogWrite(async () => {
      const products = await readCatalogProductsUnlocked();
      const product = createProductPayload(
        req.body,
        images,
        products.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
      );

      products.push(product);
      await writeCatalogProducts(products);
      return product;
    });

    res.status(201).json(publicCatalogProduct(result));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "CATALOG_CREATE_FAILED" });
  }
});

router.put("/products/:id", writeLimiter, async (req, res) => {
  try {
    const result = await queueCatalogWrite(async () => {
      const products = await readCatalogProductsUnlocked();
      const index = products.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw new Error("PRODUCT_NOT_FOUND");

      const current = products[index];
      const variantAttributes =
        req.body.variantAttributes !== undefined
          ? sanitizeVariantAttributes(req.body.variantAttributes)
          : current.variantAttributes;

      const updated: BiboCatalogProduct = {
        ...current,
        name:
          req.body.name !== undefined
            ? cleanCatalogText(req.body.name, 200)
            : current.name,
        description:
          req.body.description !== undefined
            ? cleanCatalogText(req.body.description, 4000)
            : current.description,
        variantAttributes,
        variants: summarizeVariantAttributes(variantAttributes),
        price:
          req.body.price !== undefined
            ? parseCatalogPrice(req.body.price)
            : current.price,
        updatedAt: new Date().toISOString(),
      };

      products[index] = updated;
      await writeCatalogProducts(products);
      return updated;
    });

    res.json(publicCatalogProduct(result));
  } catch (error: any) {
    res.status(error?.message === "PRODUCT_NOT_FOUND" ? 404 : 400).json({
      error: error?.message || "CATALOG_UPDATE_FAILED",
    });
  }
});

router.put("/products/:id/images", writeLimiter, async (req, res) => {
  try {
    const images = await validateCatalogImagePaths(req.body.images);

    const result = await queueCatalogWrite(async () => {
      const products = await readCatalogProductsUnlocked();
      const index = products.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw new Error("PRODUCT_NOT_FOUND");

      products[index] = {
        ...products[index],
        images,
        updatedAt: new Date().toISOString(),
      };

      await writeCatalogProducts(products);
      return products[index];
    });

    res.json(publicCatalogProduct(result));
  } catch (error: any) {
    res.status(error?.message === "PRODUCT_NOT_FOUND" ? 404 : 400).json({
      error: error?.message || "IMAGE_MAPPING_FAILED",
    });
  }
});

router.post("/products/:id/images/batch-remove", writeLimiter, async (req, res) => {
  try {
    const selected = await validateCatalogImagePaths(req.body.images);

    const result = await queueCatalogWrite(async () => {
      const products = await readCatalogProductsUnlocked();
      const index = products.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw new Error("PRODUCT_NOT_FOUND");

      const current = products[index];
      const selectedSet = new Set(selected.filter((image) => current.images.includes(image)));
      if (!selectedSet.size) throw new Error("NO_MATCHING_IMAGES");

      products[index] = {
        ...current,
        images: current.images.filter((image) => !selectedSet.has(image)),
        updatedAt: new Date().toISOString(),
      };

      await writeCatalogProducts(products);
      return products[index];
    });

    res.json(publicCatalogProduct(result));
  } catch (error: any) {
    res.status(error?.message === "PRODUCT_NOT_FOUND" ? 404 : 400).json({
      error: error?.message || "BATCH_REMOVE_FAILED",
    });
  }
});

router.post("/products/:id/images/move-to-new", writeLimiter, async (req, res) => {
  try {
    const selected = await validateCatalogImagePaths(req.body.images);

    const result = await queueCatalogWrite(async () => {
      const products = await readCatalogProductsUnlocked();
      const sourceIndex = products.findIndex((item) => item.id === req.params.id);
      if (sourceIndex < 0) throw new Error("PRODUCT_NOT_FOUND");

      const source = products[sourceIndex];
      const selectedSet = new Set(selected.filter((image) => source.images.includes(image)));
      if (!selectedSet.size) throw new Error("NO_MATCHING_IMAGES");

      const movedImages = source.images.filter((image) => selectedSet.has(image));
      const newProduct = createProductPayload(
        req.body.newProduct,
        movedImages,
        products.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
      );

      products[sourceIndex] = {
        ...source,
        images: source.images.filter((image) => !selectedSet.has(image)),
        updatedAt: new Date().toISOString(),
      };
      products.push(newProduct);

      await writeCatalogProducts(products);
      return {
        source: products[sourceIndex],
        created: newProduct,
      };
    });

    res.status(201).json({
      source: publicCatalogProduct(result.source),
      created: publicCatalogProduct(result.created),
    });
  } catch (error: any) {
    res.status(error?.message === "PRODUCT_NOT_FOUND" ? 404 : 400).json({
      error: error?.message || "MOVE_IMAGES_FAILED",
    });
  }
});

router.delete("/products/:id", writeLimiter, async (req, res) => {
  try {
    await queueCatalogWrite(async () => {
      const products = await readCatalogProductsUnlocked();
      if (!products.some((item) => item.id === req.params.id)) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const remaining = products
        .filter((item) => item.id !== req.params.id)
        .map((item, index) => ({ ...item, sortOrder: index + 1 }));

      await writeCatalogProducts(remaining);
    });

    res.json({ success: true, id: req.params.id });
  } catch (error: any) {
    res.status(error?.message === "PRODUCT_NOT_FOUND" ? 404 : 400).json({
      error: error?.message || "CATALOG_DELETE_FAILED",
    });
  }
});

export default router;
