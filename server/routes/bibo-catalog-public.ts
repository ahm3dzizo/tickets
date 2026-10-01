import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import {
  BIBO_CATALOG_FILE,
  cleanCatalogText,
  ensureCatalogWorkbook,
  parseCatalogPrice,
  publicCatalogProduct,
  queueCatalogWrite,
  readCatalogProducts,
  readCatalogProductsUnlocked,
  validateCatalogImagePaths,
  waitForCatalogWrites,
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
    await waitForCatalogWrites();
    await ensureCatalogWorkbook();
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
      const now = new Date().toISOString();

      const product: BiboCatalogProduct = {
        id: `product-${randomUUID().slice(0, 8)}`,
        name: cleanCatalogText(req.body.name, 200) || "منتج جديد",
        description: cleanCatalogText(req.body.description, 4000),
        variants: cleanCatalogText(req.body.variants, 2000),
        price: parseCatalogPrice(req.body.price),
        currency: "SAR",
        images,
        sortOrder: products.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
        createdAt: now,
        updatedAt: now,
      };

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
      const updated: BiboCatalogProduct = {
        ...current,
        name: req.body.name !== undefined ? cleanCatalogText(req.body.name, 200) : current.name,
        description: req.body.description !== undefined ? cleanCatalogText(req.body.description, 4000) : current.description,
        variants: req.body.variants !== undefined ? cleanCatalogText(req.body.variants, 2000) : current.variants,
        price: req.body.price !== undefined ? parseCatalogPrice(req.body.price) : current.price,
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
