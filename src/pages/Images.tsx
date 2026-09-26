import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Images as ImagesIcon,
  KeyRound,
  Layers3,
  Loader2,
  Moon,
  Package,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Square,
  Sun,
  Terminal,
  TriangleAlert,
  WandSparkles,
  XCircle,
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

type ClaudeStatus = {
  enabled: boolean;
  gateway: "local";
  modelConfigured: boolean;
  accessKeyConfigured: boolean;
  gatewayAuthConfigured?: boolean;
  model: string | null;
};

type ProductAnalysis = {
  kind: "product" | "logo" | "banner" | "reference" | "other";
  productNameEn: string;
  productNameAr: string;
  category: string;
  variantName: string;
  productSignature: string;
  confidence: number;
  tags: string[];
  visualSummary: string;
  qualityNotes: string;
  remasterNotes: string;
};

type AnalysisRecord = {
  status: "done" | "failed";
  analyzedAt: string;
  analysis?: ProductAnalysis;
  error?: string;
};

type AnalysisStore = Record<string, AnalysisRecord>;

type StudioTab = "dashboard" | "products" | "generated" | "review" | "logs" | "settings";

type LogEntry = {
  id: string;
  at: string;
  tone: "info" | "success" | "error" | "warning";
  message: string;
};

type ProductGroup = {
  signature: string;
  nameAr: string;
  nameEn: string;
  variant: string;
  category: string;
  confidence: number;
  tags: string[];
  files: Array<{ item: MediaItem; analysis: ProductAnalysis }>;
};

const ANALYSIS_STORAGE_KEY = "hedaya-media-analysis-v2";
const CLAUDE_KEY_STORAGE_KEY = "hedaya-media-claude-key";
const PROMPT_STORAGE_KEY = "hedaya-media-master-prompt-v2";
const LOG_STORAGE_KEY = "hedaya-media-logs-v1";

const DEFAULT_MASTER_PROMPT = [
  "HEDAYA — MASTER PRODUCT REMASTER PROMPT",
  "",
  "ROLE",
  "Act as a senior commercial product photographer, luxury ecommerce retoucher, and art director. Use the supplied source image(s) as the authoritative identity reference for the product.",
  "",
  "NON-NEGOTIABLE PRODUCT IDENTITY LOCK",
  "- Preserve the exact product identity, silhouette, geometry, proportions, construction, materials, colors, lettering, ornaments, textures, stitching, bead placement, decorative details, and all unique imperfections that distinguish this exact item.",
  "- Do NOT redesign, simplify, beautify by changing structure, replace, merge, recolor, reshape, restyle, or hallucinate any product detail.",
  "- Do NOT make one visually distinct variant look like another. Similar products with different visible designs must remain separate products.",
  "- If a hidden side or unseen construction detail cannot be inferred reliably from the references, do not invent it. Prefer a safe camera angle that preserves visible truth.",
  "",
  "REMASTERING & QUALITY",
  "- Perform premium professional retouching while keeping the product physically authentic.",
  "- Correct exposure, white balance, color cast, perspective, distracting reflections, sensor noise, compression artifacts, blur, and minor background imperfections.",
  "- Recover fine material detail and natural texture without plastic-looking oversharpening.",
  "- Preserve realistic highlights, shadows, micro-contrast, depth, and material response.",
  "- Upscale the final image to high-resolution ecommerce quality. Target at least 4K on the long edge when the generation engine supports it, with clean edges and natural detail.",
  "- Use a premium neutral or softly styled background appropriate for a handmade gifts and accessories brand. Keep the product as the clear visual hero.",
  "",
  "BRAND & LOGO",
  "- Use the provided official Hedaya logo only. Never redraw or reinterpret the logo.",
  "- Place the logo tastefully and unobtrusively, with correct aspect ratio, clear safe space, and strong contrast.",
  "- The logo must never cover important product details.",
  "",
  "CAMERA SET",
  "Create a coherent commercial set when reference coverage supports it:",
  "1. Hero three-quarter view.",
  "2. Clean front or primary catalog view.",
  "3. Detail / macro view highlighting craftsmanship.",
  "4. Alternative safe angle with realistic perspective.",
  "5. Optional elegant lifestyle composition only when it does not obscure or alter the product.",
  "",
  "COMPOSITION",
  "- Keep consistent brand lighting and color across the set.",
  "- Leave useful negative space for ecommerce UI and marketing copy where appropriate.",
  "- Avoid excessive props, fake text, duplicate objects, warped edges, extra parts, malformed decorations, or invented accessories.",
  "",
  "FINAL QUALITY CHECK",
  "Before finalizing, compare the result against the source reference. If any product-defining detail changed, restore it. Product identity fidelity has higher priority than aesthetic novelty.",
  "",
  "OUTPUT",
  "Produce a premium, realistic, high-resolution ecommerce photograph of the exact same product, ready for Hedaya storefront and marketing use.",
].join("\n");

function readAnalysisStore(): AnalysisStore {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(ANALYSIS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readLogs(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(-250) : [];
  } catch {
    return [];
  }
}

function cleanJsonText(value: string) {
  return value
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "")
    .trim();
}

function parseAnalysis(value: string): ProductAnalysis {
  const parsed = JSON.parse(cleanJsonText(value)) as Partial<ProductAnalysis>;
  const kindValues = new Set(["product", "logo", "banner", "reference", "other"]);
  const kind = kindValues.has(String(parsed.kind)) ? parsed.kind! : "other";
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12)
    : [];

  return {
    kind,
    productNameEn: String(parsed.productNameEn || "Unclassified item").trim(),
    productNameAr: String(parsed.productNameAr || "عنصر غير مصنف").trim(),
    category: String(parsed.category || "other").trim(),
    variantName: String(parsed.variantName || "default").trim(),
    productSignature: String(
      parsed.productSignature ||
        [parsed.category, parsed.productNameEn, parsed.variantName].filter(Boolean).join("-") ||
        "unclassified",
    )
      .trim()
      .toLowerCase(),
    confidence,
    tags,
    visualSummary: String(parsed.visualSummary || "").trim(),
    qualityNotes: String(parsed.qualityNotes || "").trim(),
    remasterNotes: String(parsed.remasterNotes || "").trim(),
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return (value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)) + " " + units[power];
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function productPrompt(master: string, group: ProductGroup) {
  const notes = group.files
    .map((entry) => entry.analysis.remasterNotes)
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");

  return [
    master,
    "",
    "PRODUCT-SPECIFIC REFERENCE CONTEXT",
    "Product: " + group.nameEn,
    "Arabic catalog name: " + group.nameAr,
    "Variant: " + group.variant,
    "Category: " + group.category,
    "Identity signature: " + group.signature,
    "Reference images available: " + group.files.length,
    notes ? "Safe remaster notes from visual analysis: " + notes : "",
    "",
    "Use ALL supplied reference images for this product together. Preserve this exact variant and do not borrow details from any other product or variant.",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function Images() {
  const { resolvedTheme, setTheme } = useTheme();
  const stopRequested = useRef(false);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [analysisStore, setAnalysisStore] = useState<AnalysisStore>(() => readAnalysisStore());
  const [logs, setLogs] = useState<LogEntry[]>(() => readLogs());
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null);
  const [claudeKey, setClaudeKey] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem(CLAUDE_KEY_STORAGE_KEY) || "",
  );
  const [masterPrompt, setMasterPrompt] = useState(() =>
    typeof window === "undefined"
      ? DEFAULT_MASTER_PROMPT
      : localStorage.getItem(PROMPT_STORAGE_KEY) || DEFAULT_MASTER_PROMPT,
  );
  const [tab, setTab] = useState<StudioTab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [batchError, setBatchError] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [forceRun, setForceRun] = useState(false);

  const addLog = (message: string, tone: LogEntry["tone"] = "info") => {
    setLogs((current) => {
      const next = [
        ...current,
        {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          at: new Date().toISOString(),
          tone,
          message,
        },
      ].slice(-250);
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const loadMedia = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/media", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as MediaResponse | null;
      if (!response.ok || !payload) throw new Error("تعذر تحميل مكتبة الصور.");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : "تعذر تحميل مكتبة الصور.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadStatus = async () => {
    try {
      const response = await fetch("/api/media/claude/status", { cache: "no-store" });
      if (!response.ok) return;
      setClaudeStatus((await response.json()) as ClaudeStatus);
    } catch {
      setClaudeStatus(null);
    }
  };

  useEffect(() => {
    void loadMedia();
    void loadStatus();
  }, []);

  useEffect(() => {
    if (claudeKey) localStorage.setItem(CLAUDE_KEY_STORAGE_KEY, claudeKey);
    else localStorage.removeItem(CLAUDE_KEY_STORAGE_KEY);
  }, [claudeKey]);

  useEffect(() => {
    localStorage.setItem(PROMPT_STORAGE_KEY, masterPrompt);
  }, [masterPrompt]);

  useEffect(() => {
    localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(analysisStore));
  }, [analysisStore]);

  const sourceItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !item.relativePath.toLowerCase().startsWith("generated/") &&
          !item.relativePath.toLowerCase().includes("/generated/"),
      ),
    [items],
  );

  const generatedItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.relativePath.toLowerCase().startsWith("generated/") ||
          item.relativePath.toLowerCase().includes("/generated/"),
      ),
    [items],
  );

  const analyzableItems = useMemo(
    () =>
      sourceItems.filter(
        (item) =>
          item.mimeType === "image/jpeg" ||
          item.mimeType === "image/png" ||
          item.mimeType === "image/webp" ||
          item.mimeType === "image/gif",
      ),
    [sourceItems],
  );

  const productGroups = useMemo(() => {
    const groups = new Map<string, ProductGroup>();

    for (const item of sourceItems) {
      const record = analysisStore[item.relativePath];
      const analysis = record?.status === "done" ? record.analysis : undefined;
      if (!analysis || analysis.kind !== "product") continue;

      const signature = analysis.productSignature || item.relativePath;
      const current = groups.get(signature);
      if (current) {
        current.files.push({ item, analysis });
        current.confidence =
          current.files.reduce((sum, file) => sum + file.analysis.confidence, 0) /
          current.files.length;
        current.tags = Array.from(new Set([...current.tags, ...analysis.tags])).slice(0, 12);
      } else {
        groups.set(signature, {
          signature,
          nameAr: analysis.productNameAr,
          nameEn: analysis.productNameEn,
          variant: analysis.variantName,
          category: analysis.category,
          confidence: analysis.confidence,
          tags: analysis.tags,
          files: [{ item, analysis }],
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.confidence - a.confidence);
  }, [analysisStore, sourceItems]);

  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return productGroups;
    return productGroups.filter((group) =>
      [
        group.nameAr,
        group.nameEn,
        group.variant,
        group.category,
        group.signature,
        group.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [productGroups, productQuery]);

  const completedCount = analyzableItems.filter(
    (item) => analysisStore[item.relativePath]?.status === "done",
  ).length;
  const failedCount = analyzableItems.filter(
    (item) => analysisStore[item.relativePath]?.status === "failed",
  ).length;
  const processedCount = completedCount + failedCount;
  const progress = analyzableItems.length
    ? Math.round((processedCount / analyzableItems.length) * 100)
    : 0;

  const reviewItems = useMemo(
    () =>
      sourceItems.filter((item) => {
        const record = analysisStore[item.relativePath];
        if (!record) return false;
        if (record.status === "failed") return true;
        return (
          !record.analysis ||
          record.analysis.kind === "other" ||
          record.analysis.confidence < 0.75
        );
      }),
    [analysisStore, sourceItems],
  );

  const analyzeOne = async (item: MediaItem) => {
    const response = await fetch("/api/media/claude/analyze", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-media-claude-key": claudeKey,
      },
      body: JSON.stringify({
        path: item.relativePath,
        instruction:
          "Classify conservatively. Keep visually distinct handmade product variants separate even when they belong to the same category.",
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || "فشل تحليل الصورة.");
    }

    if (!payload?.analysis || typeof payload.analysis !== "string") {
      throw new Error("الموديل لم يرجع نتيجة قابلة للحفظ.");
    }

    return parseAnalysis(payload.analysis);
  };

  const startBatch = async () => {
    if (batchRunning) return;
    if (!claudeStatus?.enabled) {
      setBatchError("ربط Vision غير مفعّل على السيرفر.");
      setTab("settings");
      return;
    }
    if (!claudeKey.trim()) {
      setBatchError("اكتب مفتاح الواجهة مرة واحدة؛ سيتم حفظه في Local Storage.");
      setTab("settings");
      return;
    }

    setBatchError("");
    setBatchRunning(true);
    stopRequested.current = false;
    addLog("بدأ تحليل المكتبة بواسطة Vision 90B.", "info");

    const queue = analyzableItems.filter(
      (item) => forceRun || analysisStore[item.relativePath]?.status !== "done",
    );

    if (!queue.length) {
      addLog("كل الصور القابلة للتحليل محللة بالفعل.", "success");
      setBatchRunning(false);
      setTab("products");
      return;
    }

    for (let index = 0; index < queue.length; index += 1) {
      if (stopRequested.current) {
        addLog("تم إيقاف التحليل بطلب المستخدم. يمكن استكماله لاحقًا.", "warning");
        break;
      }

      const item = queue[index];
      setCurrentPath(item.relativePath);
      addLog(
        "تحليل " + (index + 1) + "/" + queue.length + " — " + item.name,
        "info",
      );

      try {
        const analysis = await analyzeOne(item);
        setAnalysisStore((current) => ({
          ...current,
          [item.relativePath]: {
            status: "done",
            analyzedAt: new Date().toISOString(),
            analysis,
          },
        }));
        addLog(
          "تم: " +
            item.name +
            " → " +
            (analysis.kind === "product"
              ? analysis.productNameAr + " / " + analysis.variantName
              : analysis.kind) +
            " (" +
            Math.round(analysis.confidence * 100) +
            "%)",
          "success",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "فشل غير معروف";
        setAnalysisStore((current) => ({
          ...current,
          [item.relativePath]: {
            status: "failed",
            analyzedAt: new Date().toISOString(),
            error: message,
          },
        }));
        addLog("فشل: " + item.name + " — " + message, "error");
      }
    }

    setCurrentPath("");
    setBatchRunning(false);
    setForceRun(false);

    if (!stopRequested.current) {
      addLog(
        "انتهى التحليل. تم تجهيز المنتجات والـvariants وMaster Prompt للمرحلة التالية.",
        "success",
      );
      setTab("products");
    }
  };

  const stopBatch = () => {
    stopRequested.current = true;
  };

  const resetAnalysis = () => {
    if (batchRunning) return;
    setAnalysisStore({});
    setLogs([]);
    localStorage.removeItem(ANALYSIS_STORAGE_KEY);
    localStorage.removeItem(LOG_STORAGE_KEY);
    setBatchError("");
    setCurrentPath("");
  };

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => (current === label ? "" : current)), 1800);
  };

  const tabs: Array<{ id: StudioTab; label: string; icon: typeof Activity; count?: number }> = [
    { id: "dashboard", label: "Dashboard", icon: Activity },
    { id: "products", label: "Products", icon: Package, count: productGroups.length },
    { id: "generated", label: "Generated", icon: Sparkles, count: generatedItems.length },
    { id: "review", label: "Review", icon: TriangleAlert, count: reviewItems.length },
    { id: "logs", label: "Logs", icon: Terminal, count: logs.length },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  const logo = items.find((item) => item.name.toLowerCase() === "hedaya-logo.png");

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#090d14] dark:text-slate-50">
      <div className="mx-auto w-full max-w-[1680px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <header className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-[#101722]">
          <div className="relative p-4 sm:p-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-l from-blue-500/10 via-indigo-500/5 to-transparent" />
            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white">
                  {logo ? (
                    <img src={logo.url} alt="Hedaya" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <WandSparkles className="size-7 text-blue-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-black tracking-tight sm:text-3xl">
                      Hedaya Media Studio
                    </h1>
                    <span
                      className={
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold " +
                        (claudeStatus?.enabled
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300")
                      }
                    >
                      <span
                        className={
                          "size-2 rounded-full " +
                          (claudeStatus?.enabled ? "bg-emerald-500" : "bg-amber-500")
                        }
                      />
                      {claudeStatus?.enabled ? "Vision جاهز" : "Vision يحتاج إعداد"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 sm:text-sm dark:text-slate-400">
                    تحليل وتصنيف صور المنتجات، فصل الـvariants، وتجهيز Remaster prompts بجودة تجارية عالية.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => void startBatch()}
                  disabled={batchRunning || loading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  {batchRunning ? "جاري التحليل" : "ابدأ التحليل"}
                </button>

                <button
                  type="button"
                  onClick={stopBatch}
                  disabled={!batchRunning}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <Square className="size-4" />
                  إيقاف
                </button>

                <button
                  type="button"
                  onClick={() => void loadMedia(true)}
                  disabled={refreshing}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <RefreshCw className={"size-4 " + (refreshing ? "animate-spin" : "")} />
                  تحديث
                </button>

                <button
                  type="button"
                  onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  className="inline-flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-white transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  aria-label="تبديل الوضع"
                >
                  {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border-t border-slate-200/80 px-2 dark:border-white/10">
            <nav className="flex min-w-max items-center gap-1 py-2">
              {tabs.map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={
                    "inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-extrabold transition " +
                    (tab === id
                      ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white")
                  }
                >
                  <Icon className="size-4" />
                  {label}
                  {typeof count === "number" ? (
                    <span
                      className={
                        "rounded-full px-1.5 py-0.5 text-[10px] " +
                        (tab === id
                          ? "bg-white/15 text-current dark:bg-black/10"
                          : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400")
                      }
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {batchError ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm font-bold text-rose-700 dark:text-rose-300">
            <XCircle className="mt-0.5 size-5 shrink-0" />
            <span className="flex-1">{batchError}</span>
            <button type="button" onClick={() => setBatchError("")} className="text-xs underline">
              إغلاق
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 flex min-h-[55vh] items-center justify-center rounded-[28px] border border-slate-200 bg-white dark:border-white/10 dark:bg-[#101722]">
            <div className="flex items-center gap-3 text-sm font-black">
              <Loader2 className="size-5 animate-spin text-blue-600" />
              جاري تجهيز Media Studio...
            </div>
          </div>
        ) : null}

        {!loading && tab === "dashboard" ? (
          <div className="mt-5 space-y-5">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
              {[
                { label: "الصور الأصلية", value: sourceItems.length, icon: ImagesIcon },
                { label: "تم تحليلها", value: completedCount, icon: CheckCircle2 },
                { label: "المتبقي", value: Math.max(analyzableItems.length - processedCount, 0), icon: Activity },
                { label: "فشل / مراجعة", value: failedCount + reviewItems.length, icon: TriangleAlert },
                { label: "المنتجات", value: productGroups.length, icon: Package },
                { label: "Generated", value: generatedItems.length, icon: Sparkles },
              ].map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#101722]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
                    <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
                      <Icon className="size-4" />
                    </div>
                  </div>
                  <div className="text-3xl font-black tracking-tight">{value}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-[#101722]">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                      AI Pipeline
                    </p>
                    <h2 className="mt-1 text-xl font-black">تقدم المعالجة</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {progress}%
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-blue-600 to-indigo-500 transition-all duration-500"
                    style={{ width: progress + "%" }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{processedCount} / {analyzableItems.length} صورة</span>
                  <span className="max-w-full truncate">
                    {currentPath ? "الحالي: " + currentPath : progress === 100 ? "التحليل مكتمل" : "جاهز للبدء أو الاستكمال"}
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  {[
                    { n: "01", title: "Analysis", ready: completedCount > 0 || batchRunning },
                    { n: "02", title: "Grouping", ready: productGroups.length > 0 },
                    { n: "03", title: "Master Prompt", ready: productGroups.length > 0 },
                    { n: "04", title: "Generation", ready: generatedItems.length > 0 },
                  ].map((stage) => (
                    <div
                      key={stage.n}
                      className={
                        "rounded-2xl border p-3 transition " +
                        (stage.ready
                          ? "border-blue-500/20 bg-blue-500/5"
                          : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]")
                      }
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400">{stage.n}</span>
                        <span className={"size-2 rounded-full " + (stage.ready ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700")} />
                      </div>
                      <p className="text-xs font-black">{stage.title}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold dark:border-white/10">
                    <input
                      type="checkbox"
                      checked={forceRun}
                      onChange={(event) => setForceRun(event.target.checked)}
                      className="size-4 rounded"
                    />
                    إعادة تحليل الصور المكتملة
                  </label>
                  <button
                    type="button"
                    onClick={resetAnalysis}
                    disabled={batchRunning}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:text-rose-600 disabled:opacity-40 dark:border-white/10 dark:text-slate-400"
                  >
                    تصفير نتائج التحليل
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#0b1018] shadow-sm dark:border-white/10">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <Terminal className="size-4 text-emerald-400" />
                    Live processing log
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("logs")}
                    className="text-[11px] font-bold text-slate-400 hover:text-white"
                  >
                    عرض الكل
                  </button>
                </div>
                <div dir="ltr" className="h-[340px] overflow-y-auto p-4 font-mono text-[11px] leading-6">
                  {logs.length ? (
                    logs.slice(-18).map((entry) => (
                      <div key={entry.id} className="flex gap-2">
                        <span className="shrink-0 text-slate-600">{formatTime(entry.at)}</span>
                        <span
                          className={
                            entry.tone === "success"
                              ? "text-emerald-400"
                              : entry.tone === "error"
                                ? "text-rose-400"
                                : entry.tone === "warning"
                                  ? "text-amber-400"
                                  : "text-slate-300"
                          }
                        >
                          {entry.message}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-600">
                      اللوج سيظهر هنا عند بدء التحليل
                    </div>
                  )}
                </div>
              </div>
            </section>

            {productGroups.length > 0 ? (
              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-white/10 dark:bg-[#101722]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">أحدث المنتجات المصنفة</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      صور أكبر وتجميع محافظ على كل Variant بشكل مستقل.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("products")}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black dark:bg-white/10"
                  >
                    كل المنتجات
                  </button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {productGroups.slice(0, 6).map((group) => (
                    <ProductCard
                      key={group.signature}
                      group={group}
                      masterPrompt={masterPrompt}
                      copied={copied}
                      onCopy={copyText}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {!loading && tab === "products" ? (
          <section className="mt-5">
            <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-[#101722]">
              <div>
                <h2 className="text-xl font-black">Products & Variants</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  المنتجات المتشابهة بصريًا لكن المختلفة في الشكل تظل منفصلة حسب Product Signature.
                </p>
              </div>
              <label className="relative block w-full sm:max-w-md">
                <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="ابحث في المنتجات والـvariants..."
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pr-10 pl-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
                />
              </label>
            </div>

            {visibleProducts.length ? (
              <div className="grid gap-5 xl:grid-cols-2">
                {visibleProducts.map((group) => (
                  <ProductCard
                    key={group.signature}
                    group={group}
                    masterPrompt={masterPrompt}
                    copied={copied}
                    onCopy={copyText}
                    expanded
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Package}
                title="لسه مفيش منتجات مصنفة"
                description="ابدأ التحليل من Dashboard، وبعدها المنتجات والـvariants هتظهر هنا تلقائيًا."
              />
            )}
          </section>
        ) : null}

        {!loading && tab === "generated" ? (
          <section className="mt-5">
            <div className="mb-4 rounded-[24px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#101722]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Generated Images</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    كل الصور الناتجة منفصلة عن الأصل داخل فولدر generated.
                  </p>
                </div>
                <code dir="ltr" className="max-w-full overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 text-[11px] text-emerald-300">
                  /opt/retal-api/public/bibo/generated
                </code>
              </div>
            </div>

            {generatedItems.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {generatedItems.map((item) => (
                  <article
                    key={item.relativePath}
                    className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#101722]"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-white/5">
                      <img src={item.url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                    <div className="p-4">
                      <h3 className="truncate text-sm font-black">{item.name}</h3>
                      <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {item.relativePath}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{formatBytes(item.size)}</span>
                        <span>{item.extension.toUpperCase()}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Sparkles}
                title="فولدر Generated جاهز للمرحلة التالية"
                description="بعد توصيل محرك توليد/Remaster الصور، أي ناتج داخل generated سيظهر هنا تلقائيًا."
              />
            )}
          </section>
        ) : null}

        {!loading && tab === "review" ? (
          <section className="mt-5">
            <div className="mb-4 rounded-[24px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#101722]">
              <h2 className="text-xl font-black">Review Queue</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                صور فشلت أو ثقة التحليل فيها أقل من 75% أو لم تُصنف كمنتج واضح.
              </p>
            </div>

            {reviewItems.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {reviewItems.map((item) => {
                  const record = analysisStore[item.relativePath];
                  return (
                    <article
                      key={item.relativePath}
                      className="overflow-hidden rounded-[24px] border border-amber-500/20 bg-white shadow-sm dark:bg-[#101722]"
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-white/5">
                        <img src={item.url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                      </div>
                      <div className="p-4">
                        <h3 className="truncate font-black">{item.name}</h3>
                        {record?.status === "failed" ? (
                          <p className="mt-2 text-xs font-bold leading-5 text-rose-600 dark:text-rose-300">
                            {record.error}
                          </p>
                        ) : (
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            <p>Type: {record?.analysis?.kind || "unknown"}</p>
                            <p>Confidence: {Math.round((record?.analysis?.confidence || 0) * 100)}%</p>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="مفيش عناصر محتاجة مراجعة"
                description="لما التحليل يكتمل، أي نتيجة منخفضة الثقة هتتحول هنا تلقائيًا."
              />
            )}
          </section>
        ) : null}

        {!loading && tab === "logs" ? (
          <section className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-[#0b1018] dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-white">Processing Logs</h2>
                <p className="text-xs text-slate-500">آخر {logs.length} حدث محفوظ محليًا.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLogs([]);
                  localStorage.removeItem(LOG_STORAGE_KEY);
                }}
                className="rounded-xl bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10"
              >
                مسح اللوج
              </button>
            </div>
            <div dir="ltr" className="min-h-[60vh] overflow-x-auto p-5 font-mono text-xs leading-7">
              {logs.length ? (
                logs.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
                    <span className="text-slate-600">{formatTime(entry.at)}</span>
                    <span
                      className={
                        entry.tone === "success"
                          ? "text-emerald-400"
                          : entry.tone === "error"
                            ? "text-rose-400"
                            : entry.tone === "warning"
                              ? "text-amber-400"
                              : "text-slate-300"
                      }
                    >
                      {entry.message}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex min-h-[50vh] items-center justify-center text-slate-600">
                  No processing logs yet.
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "settings" ? (
          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(300px,.7fr)_minmax(0,1.3fr)]">
            <div className="space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101722]">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
                    <KeyRound className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-black">Vision Access Key</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      يتحفظ تلقائيًا في Local Storage على الجهاز ده.
                    </p>
                  </div>
                </div>
                <input
                  type="password"
                  value={claudeKey}
                  onChange={(event) => setClaudeKey(event.target.value)}
                  autoComplete="off"
                  placeholder="CLAUDE_MEDIA_UI_KEY"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
                />
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className={"size-2 rounded-full " + (claudeKey ? "bg-emerald-500" : "bg-slate-300")} />
                  <span className="text-slate-500 dark:text-slate-400">
                    {claudeKey ? "المفتاح محفوظ محليًا" : "أدخل المفتاح لتفعيل الـBatch"}
                  </span>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101722]">
                <div className="mb-4 flex items-center gap-3">
                  <Bot className="size-5 text-blue-600" />
                  <div>
                    <h2 className="font-black">Vision Runtime</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">FCC local gateway</p>
                  </div>
                </div>
                <dl className="space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Status</dt>
                    <dd className="font-black">{claudeStatus?.enabled ? "Ready" : "Not configured"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-slate-500">Model</dt>
                    <dd dir="ltr" className="max-w-[70%] break-all text-left font-mono text-[10px]">
                      {claudeStatus?.model || "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-[#101722]">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <WandSparkles className="size-5 text-blue-600" />
                    <h2 className="text-lg font-black">Master Remaster Prompt</h2>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Prompt إنجليزي ثابت لكل المنتجات، مع Identity Lock، Upscale، Logo، وزوايا تصوير آمنة.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMasterPrompt(DEFAULT_MASTER_PROMPT)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold dark:border-white/10"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(masterPrompt, "master")}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white dark:bg-white dark:text-slate-950"
                  >
                    <Copy className="size-3.5" />
                    {copied === "master" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <textarea
                dir="ltr"
                value={masterPrompt}
                onChange={(event) => setMasterPrompt(event.target.value)}
                spellCheck={false}
                className="min-h-[620px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-200 outline-none transition focus:border-blue-500 dark:border-white/10"
              />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ProductCard({
  group,
  masterPrompt,
  copied,
  onCopy,
  expanded = false,
}: {
  group: ProductGroup;
  masterPrompt: string;
  copied: string;
  onCopy: (text: string, label: string) => Promise<void>;
  expanded?: boolean;
}) {
  const [active, setActive] = useState(0);
  const current = group.files[Math.min(active, group.files.length - 1)];
  const copyId = "product:" + group.signature;

  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#101722]">
      <div className={expanded ? "grid lg:grid-cols-[minmax(280px,.95fr)_minmax(0,1.05fr)]" : ""}>
        <div className="relative min-h-[260px] overflow-hidden bg-slate-100 sm:min-h-[320px] dark:bg-white/5">
          <img
            src={current.item.url}
            alt={group.nameAr}
            loading="lazy"
            className="h-full min-h-[260px] w-full object-cover sm:min-h-[320px]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4 pt-16">
            <div className="flex flex-wrap items-end justify-between gap-2 text-white">
              <div>
                <p className="text-xs font-bold text-white/70">{group.category}</p>
                <h3 className="mt-1 text-lg font-black">{group.nameAr}</h3>
              </div>
              <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-black backdrop-blur">
                {Math.round(group.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{group.nameEn}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Variant: <b className="text-slate-800 dark:text-slate-200">{group.variant}</b>
              </p>
            </div>
            <span className="rounded-xl bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-black text-blue-700 dark:text-blue-300">
              {group.files.length} source
            </span>
          </div>

          {group.files.length > 1 ? (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {group.files.map((entry, index) => (
                <button
                  key={entry.item.relativePath}
                  type="button"
                  onClick={() => setActive(index)}
                  className={
                    "size-14 shrink-0 overflow-hidden rounded-xl border-2 transition " +
                    (active === index ? "border-blue-500" : "border-transparent")
                  }
                >
                  <img src={entry.item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-1.5">
            {group.tags.slice(0, 8).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Identity signature</p>
            <p dir="ltr" className="mt-1 break-all font-mono text-[10px] leading-5 text-slate-600 dark:text-slate-300">
              {group.signature}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void onCopy(productPrompt(masterPrompt, group), copyId)}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:opacity-90 dark:bg-white dark:text-slate-950"
          >
            <Copy className="size-4" />
            {copied === copyId ? "تم نسخ Prompt المنتج" : "نسخ Master Prompt للمنتج"}
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ImageIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="mt-5 rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center dark:border-white/15 dark:bg-[#101722]">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 text-lg font-black">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}
