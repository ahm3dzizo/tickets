import { useState } from "react";
import { ArrowLeftRight, Loader2, X } from "lucide-react";
import type { VariantAttribute } from "./types";
import { VariantEditor } from "./VariantEditor";

export function MoveImagesModal({
  open,
  imageCount,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  imageCount: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    price: number | null;
    variantAttributes: VariantAttribute[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) return;
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      price: price === "" ? null : Number(price),
      variantAttributes,
    });
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" dir="rtl">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 p-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 text-right">
            <h2 className="font-extrabold">نقل الصور لمنتج جديد</h2>
            <p className="text-xs text-muted-foreground">
              سيتم نقل {imageCount} صورة من المنتج الحالي للمنتج الجديد.
            </p>
          </div>
          <ArrowLeftRight className="h-5 w-5 text-primary" />
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <label className="space-y-1.5">
              <span className="block text-[11px] font-bold text-muted-foreground">اسم المنتج الجديد</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="اسم المنتج"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-[11px] font-bold text-muted-foreground">السعر</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="0.00"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="block text-[11px] font-bold text-muted-foreground">الوصف</span>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="وصف المنتج الجديد"
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <div className="space-y-2">
            <span className="block text-[11px] font-bold text-muted-foreground">المتغيرات</span>
            <VariantEditor
              value={variantAttributes}
              basePrice={price === "" ? null : Number(price)}
              onChange={setVariantAttributes}
              compact
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background/95 p-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border px-4 text-xs font-bold hover:bg-muted"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !name.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="h-4 w-4" />
            )}
            نقل وإنشاء المنتج
          </button>
        </div>
      </div>
    </div>
  );
}
