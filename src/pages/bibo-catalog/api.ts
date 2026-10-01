import type { CatalogProduct, CatalogResponse, UploadedImage } from "./types";

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function loadCatalog() {
  return parse<CatalogResponse>(
    await fetch("/api/bibo-catalog", { cache: "no-store" }),
  );
}

export async function createProduct(input: {
  name: string;
  description: string;
  variants: string;
  price: number | null;
  images: string[];
}) {
  return parse<CatalogProduct>(
    await fetch("/api/bibo-catalog/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateProduct(
  id: string,
  input: Pick<CatalogProduct, "name" | "description" | "variants" | "price">,
) {
  return parse<CatalogProduct>(
    await fetch(`/api/bibo-catalog/products/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateProductImages(id: string, images: string[]) {
  return parse<CatalogProduct>(
    await fetch(`/api/bibo-catalog/products/${encodeURIComponent(id)}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    }),
  );
}

export async function removeProduct(id: string) {
  return parse<{ success: boolean; id: string }>(
    await fetch(`/api/bibo-catalog/products/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

export async function uploadImages(files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  return parse<{ items: UploadedImage[] }>(
    await fetch("/api/bibo-catalog-upload", {
      method: "POST",
      body: form,
    }),
  );
}
