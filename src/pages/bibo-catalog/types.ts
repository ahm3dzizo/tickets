export type VariantAttribute = {
  id: string;
  name: string;
  values: string[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  variants: string;
  variantAttributes: VariantAttribute[];
  price: number | null;
  currency: string;
  images: string[];
  imageUrls: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CatalogResponse = {
  products: CatalogProduct[];
  count: number;
  excelUrl: string;
};

export type UploadedImage = {
  relativePath: string;
  url: string;
};
