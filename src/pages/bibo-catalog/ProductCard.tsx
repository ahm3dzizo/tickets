import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  CheckCheck,
  ImagePlus,
  Loader2,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { CatalogProduct, VariantAttribute } from "./types";
import {
  batchRemoveImages,
  moveImagesToNewProduct,
  removeProduct,
  updateProduct,
  updateProductImages,
  uploadImages,
} from "./api";
import { VariantEditor } from "./VariantEditor";
import { MoveImagesModal } from "./MoveImagesModal";

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
  const [batchWorking, setBatchWorking] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(product);
    setSelected(new Set());
    setSelectionMode(false);
  }, [product]);

  const dirty =
    draft.name !== product.name ||
    draft.description !== product.description ||
    JSON.stringify(draft.variantAttributes) !==
      JSON.stringify(product.variantAttributes) ||
    draft.price !== product.price;

  const save = async () => {
    setSaving(true);
    try {
      await updateProduct(product.id, {
        name: draft.name,
        description: draft.description,
        variantAttributes: draft.variantAttributes,
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

  const toggleImage = (relativePath: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
    setSelectionMode(false);
  };

  const selectAll = () => {
    setSelectionMode(true);
    setSelected(new Set(product.images));
  };

  const removeSelected = async () => {
    const images = Array.from(selected);
    if (!images.length) return;
    if (
      !window.confirm(
        `إزالة ${images.length} صورة من المنتج؟ الملفات الأصلية ستظل موجودة على السيرفر.`,
      )
    ) {
      return;
    }

    setBatchWorking(true);
    try {
      await batchRemoveImages(product.id, images);
      toast.success(`تمت إزالة ${images.length} صورة من المنتج`);
      clearSelection();
      await onRefresh();
    } catch (error: any) {
      toast.error("تعذر إزالة الصور: " + error.message);
    } finally {
      setBatchWorking(false);
    }
  };

  const moveSelected = async (input: {
    name: string;
    description: string;
    price: number | null;
    variantAttributes: VariantAttribute[];
  }) => {
    const images = Array.from(selected);
    if (!images.length) return;

    setBatchWorking(true);
    try {
      await moveImagesToNewProduct(product.id, images, input);
      toast.success(`تم نقل ${images.length} صورة إلى المنتج الجديد`);
      setShowMoveModal(false);
      clearSelection();
      await onRefresh();
    } catch (error: any) {
      toast.error("تعذر نقل الصور: " + error.message);
    } finally {
      setBatchWorking(false);
    }
  };

  const field =
    "w-full rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20";

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[370px_minmax(0,1fr)]" dir="rtl">
          <div className="border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-l">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-muted-foreground">
                {product.images.length} صورة
              </span>

              <div className="flex flex-wrap items-center gap-1.5">
                {product.images.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectionMode) clearSelection();
                      else setSelectionMode(true);
                    }}
                    className={
                      "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold " +
                      (selectionMode
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted")
                    }
                  >
                    {selectionMode ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      <CheckCheck className="h-3.5 w-3.5" />
                    )}
                    {selectionMode ? "إلغاء التحديد" : "تحديد"}
                  </button>
                )}

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
            </div>

            {selectionMode && product.images.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-2.5">
                <span className="ml-auto text-[11px] font-extrabold text-primary">
                  {selected.size} محدد
                </span>

                <button
                  type="button"
                  onClick={selectAll}
                  className="h-8 rounded-xl border border-border bg-background px-3 text-[10px] font-bold hover:bg-muted"
                >
                  تحديد الكل
                </button>

                <button
                  type="button"
                  onClick={() => void removeSelected()}
                  disabled={!selected.size || batchWorking}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-red-500/20 px-3 text-[10px] font-bold text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف المحدد
                </button>

                <button
                  type="button"
                  onClick={() => setShowMoveModal(true)}
                  disabled={!selected.size || batchWorking}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-[10px] font-bold text-primary-foreground disabled:opacity-40"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  نقل لمنتج جديد
                </button>
              </div>
            )}

            {product.images.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                {product.images.map((relativePath, index) => {
                  const active = selected.has(relativePath);

                  return (
                    <button
                      type="button"
                      key={relativePath}
                      onClick={() => {
                        if (selectionMode) toggleImage(relativePath);
                      }}
                      className={
                        "group relative aspect-square overflow-hidden rounded-xl border-2 bg-muted text-right transition " +
                        (active
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-transparent")
                      }
                    >
                      <img
                        src={product.imageUrls[index]}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />

                      {selectionMode && (
                        <span
                          className={
                            "absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm " +
                            (active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-white/80 bg-black/45 text-white")
                          }
                        >
                          {active && <Check className="h-4 w-4" />}
                        </span>
                      )}
                    </button>
                  );
                })}
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
            <div className="grid gap-4 xl:grid-cols-[1fr_1.45fr_150px]">
              <label className="space-y-1.5">
                <span className="block text-[11px] font-bold text-muted-foreground">
                  اسم المنتج
                </span>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={"h-11 " + field}
                />
              </label>

              <label className="space-y-1.5">
                <span className="block text-[11px] font-bold text-muted-foreground">
                  الوصف
                </span>
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className={"min-h-24 resize-y py-2.5 " + field}
                />
              </label>

              <label className="space-y-1.5">
                <span className="block text-[11px] font-bold text-muted-foreground">
                  السعر
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.price ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      price:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    }))
                  }
                  className={"h-11 " + field}
                  placeholder="0.00"
                />
                <p className="text-[10px] text-muted-foreground">ر.س</p>
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-muted-foreground">
                  المتغيرات والخصائص
                </span>
                <span className="text-[10px] text-muted-foreground">
                  لون / مقاس / حجم / نوع / خاصية مخصصة
                </span>
              </div>
              <VariantEditor
                value={draft.variantAttributes}
                onChange={(variantAttributes) =>
                  setDraft((current) => ({
                    ...current,
                    variantAttributes,
                  }))
                }
                compact
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <span className="text-[10px] text-muted-foreground">
                {product.id}
              </span>

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

      <MoveImagesModal
        open={showMoveModal}
        imageCount={selected.size}
        busy={batchWorking}
        onClose={() => {
          if (!batchWorking) setShowMoveModal(false);
        }}
        onSubmit={moveSelected}
      />
    </>
  );
}
