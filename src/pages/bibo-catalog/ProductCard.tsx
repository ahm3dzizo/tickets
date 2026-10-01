import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { CatalogProduct } from "./types";
import {
  removeProduct,
  updateProduct,
  updateProductImages,
  uploadImages,
} from "./api";

export function ProductCard({
  product,
  onRefresh,
}: {
  product: CatalogProduct;
  onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(product);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingImage, setRemovingImage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(product), [product]);

  const dirty =
    draft.name !== product.name ||
    draft.description !== product.description ||
    draft.variants !== product.variants ||
    draft.price !== product.price;

  const save = async () => {
    setSaving(true);
    try {
      await updateProduct(product.id, {
        name: draft.name,
        description: draft.description,
        variants: draft.variants,
        price: draft.price,
      });
      toast.success("تم حفظ بيانات المنتج");
      await onRefresh();
    } catch (error: any) {
      toast.error("فشل الحفظ: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async () => {
    if (!window.confirm(`حذف المنتج "${product.name}" من الكتالوج؟`)) return;
    setDeleting(true);
    try {
      await removeProduct(product.id);
      toast.success("تم حذف المنتج");
      await onRefresh();
    } catch (error: any) {
      toast.error("فشل حذف المنتج: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadImages(Array.from(files));
      await updateProductImages(product.id, [
        ...product.images,
        ...uploaded.items.map((item) => item.relativePath),
      ]);
      toast.success("تمت إضافة الصور");
      await onRefresh();
    } catch (error: any) {
      toast.error("فشل رفع الصور: " + error.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = async (relativePath: string) => {
    setRemovingImage(relativePath);
    try {
      await updateProductImages(
        product.id,
        product.images.filter((image) => image !== relativePath),
      );
      toast.success("تمت إزالة الصورة من المنتج");
      await onRefresh();
    } catch (error: any) {
      toast.error("تعذر إزالة الصورة: " + error.message);
    } finally {
      setRemovingImage("");
    }
  };

  const field =
    "w-full rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20";

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[340px_minmax(0,1fr)]" dir="rtl">
        <div className="border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-l">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-muted-foreground">
              {product.images.length} صورة
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold hover:bg-muted disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              إضافة صور
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => void addImages(event.target.files)}
            />
          </div>

          {product.images.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {product.images.map((relativePath, index) => (
                <div
                  key={relativePath}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                >
                  <img
                    src={product.imageUrls[index]}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => void removeImage(relativePath)}
                    disabled={removingImage === relativePath}
                    title="إزالة الصورة من المنتج"
                    className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {removingImage === relativePath ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted-foreground hover:bg-muted/40"
            >
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-bold">أضف صور المنتج</span>
            </button>
          )}
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="grid gap-4 xl:grid-cols-[1fr_1.45fr_1fr_150px]">
            <label className="space-y-1.5">
              <span className="block text-[11px] font-bold text-muted-foreground">اسم المنتج</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                className={"h-11 " + field}
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-[11px] font-bold text-muted-foreground">الوصف</span>
              <textarea
                rows={3}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                className={"min-h-24 resize-y py-2.5 " + field}
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-[11px] font-bold text-muted-foreground">المتغيرات</span>
              <textarea
                rows={3}
                value={draft.variants}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, variants: event.target.value }))
                }
                className={"min-h-24 resize-y py-2.5 " + field}
                placeholder="مثال: أبيض | وردي | ذهبي"
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-[11px] font-bold text-muted-foreground">السعر</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    price:
                      event.target.value === "" ? null : Number(event.target.value),
                  }))
                }
                className={"h-11 " + field}
                placeholder="0.00"
              />
              <p className="text-[10px] text-muted-foreground">ر.س</p>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-[10px] text-muted-foreground">{product.id}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void deleteProduct()}
                disabled={deleting}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 px-3 text-xs font-bold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                حذف المنتج
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saving}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                حفظ
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
