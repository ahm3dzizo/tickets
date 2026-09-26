import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Grid2X2,
  Grid3X3,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  Maximize2,
  Moon,
  RefreshCw,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";

type MediaItem = {
  name: string;
  relativePath: string;
  extension: string;
  mimeType: string;
  size: number;
  modifiedAt: string;
  url: string;
};

type MediaResponse = {
  items: MediaItem[];
  count: number;
  truncated: boolean;
};

type SortMode = "newest" | "oldest" | "name" | "size";
type GridMode = "compact" | "comfortable" | "large";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** power;
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const gridClasses: Record<GridMode, string> = {
  compact:
    "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7",
  comfortable:
    "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
  large:
    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

export default function Images() {
  const { resolvedTheme, setTheme } = useTheme();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [extension, setExtension] = useState("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [grid, setGrid] = useState<GridMode>("comfortable");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [dimensions, setDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const loadMedia = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const response = await fetch("/api/media", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "تعذر تحميل مكتبة الصور.");
      }

      const payload = (await response.json()) as MediaResponse;
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل مكتبة الصور.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadMedia();
  }, []);

  const extensions = useMemo(
    () => Array.from(new Set(items.map((item) => item.extension))).sort(),
    [items],
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ar");

    const filtered = items.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        item.name.toLocaleLowerCase("ar").includes(normalizedQuery) ||
        item.relativePath.toLocaleLowerCase("ar").includes(normalizedQuery);
      const matchesExtension =
        extension === "all" || item.extension === extension;

      return matchesQuery && matchesExtension;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "name") {
        return a.name.localeCompare(b.name, "ar", { numeric: true });
      }
      if (sort === "size") return b.size - a.size;

      const aTime = new Date(a.modifiedAt).getTime();
      const bTime = new Date(b.modifiedAt).getTime();
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [items, query, extension, sort]);

  const selectedIndex = visibleItems.findIndex(
    (item) => item.relativePath === selectedPath,
  );
  const selectedItem =
    selectedIndex >= 0 ? visibleItems[selectedIndex] : null;

  const closePreview = () => setSelectedPath(null);

  const movePreview = (direction: -1 | 1) => {
    if (!visibleItems.length || selectedIndex < 0) return;
    const next =
      (selectedIndex + direction + visibleItems.length) % visibleItems.length;
    setSelectedPath(visibleItems[next].relativePath);
  };

  useEffect(() => {
    if (!selectedItem) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
      if (event.key === "ArrowRight") movePreview(-1);
      if (event.key === "ArrowLeft") movePreview(1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItem, selectedIndex, visibleItems.length]);

  const copyFilename = async (item: MediaItem) => {
    await navigator.clipboard.writeText(item.name);
    setCopiedPath(item.relativePath);
    window.setTimeout(() => {
      setCopiedPath((current) =>
        current === item.relativePath ? null : current,
      );
    }, 1400);
  };

  const recordDimensions = (
    item: MediaItem,
    image: HTMLImageElement,
  ) => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    setDimensions((current) => {
      const existing = current[item.relativePath];
      if (
        existing?.width === image.naturalWidth &&
        existing?.height === image.naturalHeight
      ) {
        return current;
      }

      return {
        ...current,
        [item.relativePath]: {
          width: image.naturalWidth,
          height: image.naturalHeight,
        },
      };
    });
  };

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-background text-foreground"
    >
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ImageIcon className="size-6" />
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    إدارة الصور
                  </h1>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                    Public Gallery
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  معرض مستقل لعرض وفحص الصور بدون تسجيل دخول أو ارتباط بالتذاكر.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-2xl border border-border bg-muted/60 px-3 py-2 text-sm">
                <span className="font-extrabold">{items.length}</span>
                <span className="mr-1 text-muted-foreground">صورة</span>
              </div>

              <button
                type="button"
                onClick={() => void loadMedia(true)}
                disabled={refreshing}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border bg-card px-3.5 text-sm font-bold transition hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                />
                تحديث
              </button>

              <button
                type="button"
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
                className="inline-flex size-10 items-center justify-center rounded-2xl border border-border bg-card transition hover:bg-muted"
                aria-label="تبديل الوضع"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </button>
            </div>
          </div>
        </header>

        <section className="mb-5 rounded-3xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث باسم الصورة..."
                className="h-11 w-full rounded-2xl border border-border bg-background pr-10 pl-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              />
            </label>

            <select
              value={extension}
              onChange={(event) => setExtension(event.target.value)}
              className="h-11 rounded-2xl border border-border bg-background px-3 text-sm font-bold outline-none focus:border-primary/50"
            >
              <option value="all">كل الأنواع</option>
              {extensions.map((value) => (
                <option value={value} key={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="h-11 rounded-2xl border border-border bg-background px-3 text-sm font-bold outline-none focus:border-primary/50"
            >
              <option value="newest">الأحدث أولاً</option>
              <option value="oldest">الأقدم أولاً</option>
              <option value="name">حسب الاسم</option>
              <option value="size">حسب الحجم</option>
            </select>

            <div className="flex h-11 items-center gap-1 rounded-2xl border border-border bg-background p-1">
              {(
                [
                  ["compact", Grid3X3, "شبكة صغيرة"],
                  ["comfortable", Grid2X2, "شبكة متوسطة"],
                  ["large", Maximize2, "شبكة كبيرة"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGrid(value)}
                  aria-label={label}
                  className={`inline-flex h-9 flex-1 items-center justify-center rounded-xl px-3 transition ${
                    grid === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-3xl border border-destructive/20 bg-destructive/5 p-8 text-center">
            <ImageOff className="mx-auto mb-3 size-9 text-destructive" />
            <h2 className="mb-1 font-extrabold">تعذر عرض الصور</h2>
            <p className="mb-4 text-sm text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => void loadMedia()}
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              إعادة المحاولة
            </button>
          </section>
        ) : loading ? (
          <div className="flex min-h-[45vh] items-center justify-center">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm font-bold shadow-sm">
              <Loader2 className="size-5 animate-spin text-primary" />
              جاري تحميل مكتبة الصور...
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-border bg-card/60 p-12 text-center">
            <ImageIcon className="mx-auto mb-3 size-10 text-muted-foreground" />
            <h2 className="font-extrabold">لا توجد صور مطابقة</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              جرّب تغيير البحث أو الفلتر.
            </p>
          </section>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span>
                عرض <b className="text-foreground">{visibleItems.length}</b> من{" "}
                <b className="text-foreground">{items.length}</b>
              </span>
              <span>اضغط على أي صورة للمعاينة</span>
            </div>

            <section
              className={`grid gap-3 sm:gap-4 ${gridClasses[grid]}`}
            >
              {visibleItems.map((item) => {
                const dim = dimensions[item.relativePath];
                return (
                  <article
                    key={item.relativePath}
                    className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedPath(item.relativePath)}
                      className="relative block aspect-[4/3] w-full overflow-hidden bg-muted"
                    >
                      {broken[item.relativePath] ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                          <ImageOff className="size-8" />
                          <span className="text-xs font-bold">تعذر العرض</span>
                        </div>
                      ) : (
                        <img
                          src={item.url}
                          alt={item.name}
                          loading="lazy"
                          decoding="async"
                          onLoad={(event) =>
                            recordDimensions(item, event.currentTarget)
                          }
                          onError={() =>
                            setBroken((current) => ({
                              ...current,
                              [item.relativePath]: true,
                            }))
                          }
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
                        />
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                      <span className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-black/60 px-2 py-1 text-[11px] font-bold text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                        معاينة
                      </span>
                    </button>

                    <div className="p-3.5">
                      <div className="mb-2 flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <h2
                            title={item.name}
                            className="truncate text-sm font-extrabold"
                          >
                            {item.name}
                          </h2>
                          <p
                            title={item.relativePath}
                            className="mt-0.5 truncate text-[11px] text-muted-foreground"
                          >
                            {item.relativePath}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-muted px-2 py-1 text-[10px] font-extrabold uppercase text-muted-foreground">
                          {item.extension}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{formatBytes(item.size)}</span>
                        {dim ? (
                          <span>
                            {dim.width}×{dim.height}
                          </span>
                        ) : null}
                        <span>{formatDate(item.modifiedAt)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>

      {selectedItem ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`معاينة ${selectedItem.name}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePreview();
          }}
        >
          <div className="relative flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-background shadow-2xl lg:flex-row">
            <div className="relative flex min-h-[45vh] flex-1 items-center justify-center overflow-hidden bg-black/90 lg:min-h-[80vh]">
              {broken[selectedItem.relativePath] ? (
                <div className="flex flex-col items-center gap-3 text-white/70">
                  <ImageOff className="size-12" />
                  <span className="font-bold">تعذر عرض الصورة</span>
                </div>
              ) : (
                <img
                  src={selectedItem.url}
                  alt={selectedItem.name}
                  onLoad={(event) =>
                    recordDimensions(selectedItem, event.currentTarget)
                  }
                  className="max-h-[78vh] max-w-full object-contain"
                />
              )}

              {visibleItems.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => movePreview(-1)}
                    className="absolute right-3 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-2xl bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
                    aria-label="الصورة السابقة"
                  >
                    <ArrowRight className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePreview(1)}
                    className="absolute left-3 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-2xl bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
                    aria-label="الصورة التالية"
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={closePreview}
                className="absolute left-3 top-3 inline-flex size-10 items-center justify-center rounded-2xl bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
                aria-label="إغلاق"
              >
                <X className="size-5" />
              </button>
            </div>

            <aside className="w-full shrink-0 border-t border-border bg-card p-5 lg:w-[340px] lg:border-r lg:border-t-0">
              <div className="mb-5">
                <p className="mb-1 text-xs font-bold text-primary">
                  {selectedIndex + 1} / {visibleItems.length}
                </p>
                <h2 className="break-words text-lg font-extrabold">
                  {selectedItem.name}
                </h2>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {selectedItem.relativePath}
                </p>
              </div>

              <dl className="space-y-3 rounded-2xl border border-border bg-muted/35 p-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">النوع</dt>
                  <dd className="font-bold">{selectedItem.mimeType}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">الحجم</dt>
                  <dd className="font-bold">{formatBytes(selectedItem.size)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">الأبعاد</dt>
                  <dd className="font-bold">
                    {dimensions[selectedItem.relativePath]
                      ? `${dimensions[selectedItem.relativePath].width}×${dimensions[selectedItem.relativePath].height}`
                      : "—"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">آخر تعديل</dt>
                  <dd className="text-left font-bold">
                    {formatDate(selectedItem.modifiedAt)}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => void copyFilename(selectedItem)}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground transition hover:opacity-90"
              >
                {copiedPath === selectedItem.relativePath ? (
                  <>
                    <Check className="size-4" />
                    تم نسخ اسم الملف
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    نسخ اسم الملف
                  </>
                )}
              </button>
            </aside>
          </div>
        </div>
      ) : null}
    </main>
  );
}
