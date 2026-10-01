import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Images,
  Loader2,
  PackagePlus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "./bibo-catalog/ProductCard";
import { VariantEditor } from "./bibo-catalog/VariantEditor";
import {
  createProduct,
  loadCatalog,
  uploadImages,
} from "./bibo-catalog/api";
import type {
  CatalogProduct,
  VariantAttribute,
} from "./bibo-catalog/types";

type NewProduct = {
  name: string;
  description: string;
  variantAttributes: VariantAttribute[];
  price: string;
};

const EMPTY: NewProduct = {
  name: "",
  description: "",
  variantAttributes: [],
  price: "",
};

export default function BiboCatalog() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<NewProduct>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const data = await loadCatalog();
      setProducts(data.products);
    } catch (error: any) {
      toast.error("تعذر تحميل الكتالوج: " + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products;

    return products.filter((product) => {
      const variantText = product.variantAttributes
        .flatMap((attribute) => [
          attribute.name,
          ...attribute.values.map((item) => item.label),
        ])
        .join(" ");

      return [
        product.name,
        product.description,
        product.variants,
        variantText,
        product.id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(value);
    });
  }, [products, query]);

  const addProduct = async () => {
    if (!draft.name.trim()) return;

    setCreating(true);
    try {
      let images: string[] = [];

      if (files.length) {
        const uploaded = await uploadImages(files);
        images = uploaded.items.map((item) => item.relativePath);
      }

      await createProduct({
        name: draft.name,
        description: draft.description,
        variantAttributes: draft.variantAttributes,
        price: draft.price === "" ? null : Number(draft.price),
        images,
      });

      toast.success("تمت إضافة المنتج");
      setDraft(EMPTY);
      setFiles([]);
      setShowCreate(false);
      await load(true);
    } catch (error: any) {
      toast.error("فشل إضافة المنتج: " + error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card p-1.5">
            <img
              src="/api/media/file?path=Hedaya-Logo.png"
              alt="Hedaya"
              className="h-full w-full object-contain"
            />
          </div>

          <div className="min-w-0 flex-1 text-right">
            <h1 className="truncate text-base font-extrabold sm:text-lg">
              كتالوج منتجات Hedaya
            </h1>
            <p className="text-[10px] text-muted-foreground sm:text-xs">
              الصور والبيانات والمتغيرات قابلة للتعديل — الحفظ في products.xlsx
            </p>
          </div>

          <a
            href="/api/bibo-catalog/excel"
            className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold hover:bg-muted sm:inline-flex"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </a>

          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted disabled:opacity-50"
            title="تحديث"
          >
            <RefreshCw
              className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")}
            />
          </button>

          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground sm:px-4"
          >
            {showCreate ? (
              <X className="h-4 w-4" />
            ) : (
              <PackagePlus className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {showCreate ? "إلغاء" : "منتج جديد"}
            </span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1700px] space-y-4 px-4 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالاسم أو الوصف أو اللون أو المقاس أو النوع..."
              className="h-11 w-full rounded-2xl border border-border bg-card pr-11 pl-4 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-xs font-bold text-muted-foreground">
            <Images className="h-4 w-4" />
            {products.length} منتج
          </div>
        </div>

        {showCreate && (
          <section className="rounded-3xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <div className="mb-4 text-right">
              <h2 className="font-extrabold">إضافة منتج جديد</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                أضف بيانات المنتج وصوره وخصائصه المنظمة.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_180px_1fr]">
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="اسم المنتج"
                className="h-11 rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                placeholder="السعر ر.س"
                className="h-11 rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />

              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 text-xs font-bold hover:bg-muted">
                <Images className="h-4 w-4" />
                {files.length
                  ? `${files.length} صورة مختارة`
                  : "اختيار الصور"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(event) =>
                    setFiles(Array.from(event.target.files ?? []))
                  }
                />
              </label>
            </div>

            <textarea
              rows={3}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="وصف المنتج"
              className="mt-3 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />

            <div className="mt-4 rounded-2xl border border-border bg-background p-3">
              <div className="mb-2">
                <h3 className="text-sm font-extrabold">
                  المتغيرات والخصائص
                </h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  اختر اسم الخاصية مثل اللون أو المقاس أو الحجم أو النوع، أو اكتب خاصية جديدة.
                </p>
              </div>

              <VariantEditor
                value={draft.variantAttributes}
                basePrice={draft.price === "" ? null : Number(draft.price)}
                onChange={(variantAttributes) =>
                  setDraft((current) => ({
                    ...current,
                    variantAttributes,
                  }))
                }
              />
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void addProduct()}
                disabled={creating || !draft.name.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground disabled:opacity-40"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackagePlus className="h-4 w-4" />
                )}
                إضافة المنتج
              </button>
            </div>
          </section>
        )}

        {loading ? (
          <div className="flex min-h-[45vh] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length ? (
          <div className="space-y-4">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onRefresh={() => load(true)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-card text-muted-foreground">
            <Images className="h-10 w-10 opacity-30" />
            <p className="font-bold">لا توجد نتائج</p>
          </div>
        )}

        <div className="flex justify-center py-4">
          <a
            href="/api/bibo-catalog/excel"
            className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            تنزيل ملف Excel
          </a>
        </div>
      </main>
    </div>
  );
}
