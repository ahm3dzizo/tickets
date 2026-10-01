import { useState } from "react";
import { Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { VariantAttribute, VariantValue } from "./types";

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
  return (
    globalThis.crypto?.randomUUID?.() ||
    `attr-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function VariantEditor({
  value,
  onChange,
  basePrice,
  compact = false,
}: {
  value: VariantAttribute[];
  onChange: (next: VariantAttribute[]) => void;
  basePrice: number | null;
  compact?: boolean;
}) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const addAttribute = () => {
    onChange([...value, { id: newId(), name: "", values: [] }]);
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

    for (const label of candidates) {
      const exists = next.some(
        (current) =>
          current.label.toLocaleLowerCase("ar") ===
          label.toLocaleLowerCase("ar"),
      );

      if (!exists) {
        next.push({
          id: newId(),
          label,
          priceOverride: null,
        });
      }
    }

    updateAttribute(attribute.id, { values: next });
    setDraftValues((current) => ({ ...current, [attribute.id]: "" }));
  };

  const updateValue = (
    attribute: VariantAttribute,
    valueId: string,
    patch: Partial<VariantValue>,
  ) => {
    updateAttribute(attribute.id, {
      values: attribute.values.map((item) =>
        item.id === valueId ? { ...item, ...patch } : item,
      ),
    });
  };

  const removeValue = (attribute: VariantAttribute, valueId: string) => {
    updateAttribute(attribute.id, {
      values: attribute.values.filter((item) => item.id !== valueId),
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

          {attribute.values.length > 0 && (
            <div className="mt-3 space-y-2">
              {attribute.values.map((item) => {
                const effectivePrice = item.priceOverride ?? basePrice;
                const inheritsBasePrice = item.priceOverride === null;

                return (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-xl border border-border bg-background p-2 sm:grid-cols-[minmax(120px,1fr)_160px_150px_34px]"
                  >
                    <input
                      value={item.label}
                      onChange={(event) =>
                        updateValue(attribute, item.id, {
                          label: event.target.value,
                        })
                      }
                      className="h-9 min-w-0 rounded-lg border border-border bg-background px-2.5 text-right text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="قيمة المتغير"
                    />

                    <select
                      value={inheritsBasePrice ? "base" : "custom"}
                      onChange={(event) => {
                        if (event.target.value === "base") {
                          updateValue(attribute, item.id, {
                            priceOverride: null,
                          });
                        } else {
                          updateValue(attribute, item.id, {
                            priceOverride: basePrice ?? 0,
                          });
                        }
                      }}
                      className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="base">السعر الأساسي</option>
                      <option value="custom">سعر مخصص</option>
                    </select>

                    {inheritsBasePrice ? (
                      <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-dashed border-border px-2.5 text-[11px]">
                        <span className="text-muted-foreground">السعر</span>
                        <span className="font-extrabold">
                          {basePrice === null ? "غير محدد" : `${basePrice} ر.س`}
                        </span>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.priceOverride ?? ""}
                          onChange={(event) =>
                            updateValue(attribute, item.id, {
                              priceOverride:
                                event.target.value === ""
                                  ? 0
                                  : Number(event.target.value),
                            })
                          }
                          className="h-9 w-full rounded-lg border border-border bg-background pr-2.5 pl-9 text-right text-xs font-extrabold outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground">
                          ر.س
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => removeValue(attribute, item.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                      title="حذف القيمة"
                    >
                      <X className="h-4 w-4" />
                    </button>

                    {!compact && (
                      <div className="sm:col-span-4 flex flex-wrap items-center gap-2 px-1 text-[10px] text-muted-foreground">
                        <span>
                          السعر النهائي:{" "}
                          <strong className="text-foreground">
                            {effectivePrice === null
                              ? "غير محدد"
                              : `${effectivePrice} ر.س`}
                          </strong>
                        </span>
                        {!inheritsBasePrice && (
                          <button
                            type="button"
                            onClick={() =>
                              updateValue(attribute, item.id, {
                                priceOverride: null,
                              })
                            }
                            className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" />
                            رجوع للسعر الأساسي
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
