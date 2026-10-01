export type VariantValue = {
  id: string;
  label: string;
  priceOverride: number | null;
};

export type VariantAttribute = {
  id: string;
  name: string;
  values: VariantValue[];
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
