import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { VariantAttribute } from "./types";

const SUGGESTED_NAMES = [
  "اللون",
  "المقاس",
  "الحجم",
  "النوع",
  "الخامة",
  "النمط",
  "الكمية",
  "التخصيص",
];

function newId() {
  return globalThis.crypto?.randomUUID?.() || `attr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function VariantEditor({
  value,
  onChange,
  compact = false,
}: {
  value: VariantAttribute[];
  onChange: (next: VariantAttribute[]) => void;
  compact?: boolean;
}) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const addAttribute = () => {
    onChange([
      ...value,
      { id: newId(), name: "", values: [] },
    ]);
  };

  const updateAttribute = (
    id: string,
    patch: Partial<VariantAttribute>,
  ) => {
    onChange(
      value.map((attribute) =>
        attribute.id === id ? { ...attribute, ...patch } : attribute,
      ),
    );
  };

  const removeAttribute = (id: string) => {
    onChange(value.filter((attribute) => attribute.id !== id));
  };

  const addValue = (attribute: VariantAttribute) => {
    const raw = (draftValues[attribute.id] || "").trim();
    if (!raw) return;

    const candidates = raw
      .split(/[،,]/)
      .map((item) => item.trim())
      .filter(Boolean);

    const next = [...attribute.values];
    for (const item of candidates) {
      if (!next.some((current) => current.toLocaleLowerCase("ar") === item.toLocaleLowerCase("ar"))) {
        next.push(item);
      }
    }

    updateAttribute(attribute.id, { values: next });
    setDraftValues((current) => ({ ...current, [attribute.id]: "" }));
  };

  const removeValue = (attribute: VariantAttribute, item: string) => {
    updateAttribute(attribute.id, {
      values: attribute.values.filter((valueItem) => valueItem !== item),
    });
  };

  return (
    <div className="space-y-3" dir="rtl">
      {value.map((attribute) => (
        <div
          key={attribute.id}
          className="rounded-2xl border border-border bg-muted/20 p-3"
        >
          <div className="flex items-center gap-2">
            <input
              list="bibo-variant-names"
              value={attribute.name}
              onChange={(event) =>
                updateAttribute(attribute.id, { name: event.target.value })
              }
              placeholder="اسم الخاصية: اللون، المقاس..."
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => removeAttribute(attribute.id)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10"
              title="حذف الخاصية"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <datalist id="bibo-variant-names">
            {SUGGESTED_NAMES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {attribute.values.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold"
              >
                {item}
                <button
                  type="button"
                  onClick={() => removeValue(attribute, item)}
                  className="rounded-full hover:bg-muted"
                  title="حذف القيمة"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              value={draftValues[attribute.id] || ""}
              onChange={(event) =>
                setDraftValues((current) => ({
                  ...current,
                  [attribute.id]: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addValue(attribute);
                }
              }}
              placeholder="أضف قيمة مثل: أحمر أو XL ثم Enter"
              className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-right text-xs outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => addValue(attribute)}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-background px-3 text-[11px] font-bold hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              قيمة
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addAttribute}
        className={
          "inline-flex items-center gap-2 rounded-xl border border-dashed border-border bg-background font-bold hover:bg-muted " +
          (compact ? "h-9 px-3 text-[11px]" : "h-10 px-4 text-xs")
        }
      >
        <Plus className="h-4 w-4" />
        إضافة خاصية
      </button>
    </div>
  );
}
