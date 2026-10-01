import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
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

function normalizePrice(value: number) {
  return Math.round(value * 100) / 100;
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
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

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

  const commitPrice = (
    attribute: VariantAttribute,
    item: VariantValue,
  ) => {
    const raw = priceDrafts[item.id];
    if (raw === undefined) return;

    const trimmed = raw.trim();
    let priceOverride: number | null = null;

    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed >= 0) {
        const normalized = normalizePrice(parsed);
        priceOverride =
          basePrice !== null && normalized === normalizePrice(basePrice)
            ? null
            : normalized;
      }
    }

    updateValue(attribute, item.id, { priceOverride });
    setPriceDrafts((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
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
              placeholder="النوع: لون، مقاس، حجم..."
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-right text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
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
            <div
              className={
                "mt-3 grid gap-2 " +
                (compact
                  ? "sm:grid-cols-2"
                  : "sm:grid-cols-2 xl:grid-cols-3")
              }
            >
              {attribute.values.map((item) => {
                const shownPrice =
                  priceDrafts[item.id] ??
                  String(item.priceOverride ?? basePrice ?? "");

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-background p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={item.label}
                        onChange={(event) =>
                          updateValue(attribute, item.id, {
                            label: event.target.value,
                          })
                        }
                        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-right text-xs font-extrabold outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="قيمة المتغير"
                      />
                      <button
                        type="button"
                        onClick={() => removeValue(attribute, item.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                        title="حذف القيمة"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <label className="mt-2 block">
                      <span className="mb-1 block text-[9px] font-bold text-muted-foreground">
                        السعر
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={shownPrice}
                          onFocus={() =>
                            setPriceDrafts((current) => ({
                              ...current,
                              [item.id]: String(
                                item.priceOverride ?? basePrice ?? "",
                              ),
                            }))
                          }
                          onChange={(event) =>
                            setPriceDrafts((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          onBlur={() => commitPrice(attribute, item)}
                          className="h-9 w-full rounded-lg border border-border bg-background pr-2.5 pl-10 text-right text-xs font-extrabold outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder={
                            basePrice === null
                              ? "السعر"
                              : String(basePrice)
                          }
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground">
                          ر.س
                        </span>
                      </div>
                    </label>
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
              placeholder="أضف قيمة: أحمر، XL، كبير..."
              className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-right text-xs outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => addValue(attribute)}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-background px-3 text-[11px] font-bold hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة
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
        إضافة نوع
      </button>
    </div>
  );
}
