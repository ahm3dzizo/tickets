import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { projectsApi, warrantiesApi } from "@/lib/api";
import { toast } from "sonner";

type FieldKey = "blockNumber" | "unitNumber" | "name" | "phone" | "handoverDate" | "warrantyExpiryDate";
const FIELDS: { key: FieldKey; label: string; aliases: string[]; required?: boolean }[] = [
  { key: "blockNumber", label: "رقم البلوك", aliases: ["رقم البلوك", "البلوك", "بلوك", "block", "block number"] },
  { key: "unitNumber", label: "رقم الوحدة / الفيلا", aliases: ["رقم الوحدة", "الوحدة", "رقم الفيلا", "الفيلا", "فيلا", "villa", "unit", "unit number"], required: true },
  { key: "name", label: "اسم العميل", aliases: ["اسم العميل", "الاسم", "اسم المالك", "name", "client name"] },
  { key: "phone", label: "رقم الجوال", aliases: ["رقم الجوال", "الجوال", "رقم الهاتف", "الهاتف", "phone", "mobile"] },
  { key: "handoverDate", label: "تاريخ التسليم", aliases: ["تاريخ التسليم", "تاريخ الاستلام", "handover date", "handover"] },
  { key: "warrantyExpiryDate", label: "تاريخ انتهاء الضمان", aliases: ["تاريخ انتهاء الضمان", "انتهاء الضمان", "تاريخ الانتهاء", "warranty expiry", "warranty end"] },
];
const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase().replace(/[\\s_ـ-]+/g, "");

export default function ProjectSetupWizard() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ blockNumber: "", unitNumber: "", name: "", phone: "", handoverDate: "", warrantyExpiryDate: "" });
  const [step, setStep] = useState<"upload" | "mapping" | "warranty">("upload");
  const [busy, setBusy] = useState(false);
  const [warrantyFile, setWarrantyFile] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<{ blocksCreated: number; unitsCreated: number; clientsLinked: number } | null>(null);
  const [errorText, setErrorText] = useState("");

  const warrantyIncluded = useMemo(() => rows.some(row =>
    Boolean(mapping.handoverDate && String(row[mapping.handoverDate] ?? "").trim()) ||
    Boolean(mapping.warrantyExpiryDate && String(row[mapping.warrantyExpiryDate] ?? "").trim())
  ), [rows, mapping]);

  const readWorkbook = async (file: File) => {
    setBusy(true);
    setErrorText("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("ملف Excel لا يحتوي على ورقة بيانات");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      let headerIndex = 0;
      let best = -1;
      for (let i = 0; i < Math.min(matrix.length, 100); i++) {
        const score = FIELDS.filter(field => matrix[i].some(cell =>
          field.aliases.some(alias => normalize(alias) === normalize(cell))
        )).length;
        if (score > best) { best = score; headerIndex = i; }
      }
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: headerIndex, defval: "" });
      if (!data.length) throw new Error("لم يتم العثور على صفوف بيانات");
      const cols = Object.keys(data[0]);
      const next = {} as Record<FieldKey, string>;
      FIELDS.forEach(field => {
        next[field.key] = cols.find(column => field.aliases.some(alias => normalize(alias) === normalize(column)))
          || cols.find(column => field.aliases.some(alias => {
            const a = normalize(alias), c = normalize(column);
            return a.length >= 4 && c.length >= 4 && (c.includes(a) || a.includes(c));
          })) || "";
      });
      setFileName(file.name);
      setColumns(cols);
      setRows(data);
      setMapping(next);
      setStep("mapping");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "تعذر قراءة الملف");
    } finally { setBusy(false); }
  };

  const mappedRows = () => rows.map(row => ({
    blockNumber: mapping.blockNumber ? String(row[mapping.blockNumber] ?? "").trim() : "",
    unitNumber: mapping.unitNumber ? String(row[mapping.unitNumber] ?? "").trim() : "",
    name: mapping.name ? String(row[mapping.name] ?? "").trim() : "",
    phone: mapping.phone ? String(row[mapping.phone] ?? "").trim() : "",
    handoverDate: mapping.handoverDate ? String(row[mapping.handoverDate] ?? "").trim() : "",
    warrantyExpiryDate: mapping.warrantyExpiryDate ? String(row[mapping.warrantyExpiryDate] ?? "").trim() : "",
  })).filter(row => row.unitNumber);

  const importStructure = async () => {
    const data = mappedRows();
    if (!mapping.unitNumber || !data.length) {
      setErrorText("اربط عمود رقم الوحدة وتأكد من وجود صف واحد على الأقل يحتوي على رقم وحدة");
      return;
    }
    setBusy(true);
    setErrorText("");
    try {
      const result = await projectsApi.importStructure(id, data);
      setImportSummary(result);
      if (warrantyIncluded) {
        toast.success("تم استيراد بيانات العملاء والوحدات والضمانات");
        navigate(`/projects/${id}`, { replace: true });
      } else {
        setStep("warranty");
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "فشل استيراد البيانات");
    } finally { setBusy(false); }
  };

  const importWarranties = async () => {
    if (!warrantyFile) return skipWarranties();
    setBusy(true);
    setErrorText("");
    try {
      const result = await warrantiesApi.import(warrantyFile, id);
      toast.success(`تم تحديث ضمانات ${result.updated} وحدة`);
      navigate(`/projects/${id}`, { replace: true });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "فشل استيراد الضمانات");
    } finally { setBusy(false); }
  };
  const skipWarranties = () => navigate(`/projects/${id}`, { replace: true });

  return (
    <Layout>
      <main dir="rtl" className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">إعداد المشروع</h1>
            <p className="mt-1 text-sm text-muted-foreground">استيراد البلوكات والوحدات والعملاء ثم الضمانات عند الحاجة.</p>
          </div>
          <Button variant="ghost" onClick={() => navigate("/projects")}><ArrowLeft className="ml-2 h-4 w-4" /> المشاريع</Button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
          {["بيانات المشروع", "العملاء والوحدات", "الضمانات"].map((label, index) => (
            <div key={label} className={`rounded-xl border p-3 ${(index === 1 && step !== "warranty") || (index === 2 && step === "warranty") ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{index + 1}. {label}</div>
          ))}
        </div>

        {step === "upload" && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center space-y-4">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-primary" />
            <h2 className="text-lg font-bold">استيراد العملاء والوحدات</h2>
            <p className="text-sm text-muted-foreground">ارفع ملف Excel واحدًا. يمكن أن يحتوي الصف على وحدة فقط دون عميل، أو على بيانات العميل والوحدة معًا.</p>
            <label className="mx-auto flex max-w-lg cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 hover:border-primary">
              <Upload className="h-7 w-7" />
              <span>{busy ? "جاري قراءة الملف..." : "اختيار ملف Excel أو CSV"}</span>
              <span className="text-xs text-muted-foreground">xlsx · xls · csv</span>
              <input className="hidden" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void readWorkbook(file); }} />
            </label>
            {errorText && <p className="whitespace-pre-wrap text-sm text-destructive">{errorText}</p>}
          </section>
        )}

        {step === "mapping" && (
          <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
            <div><h2 className="font-bold">ربط أعمدة الملف</h2><p className="text-xs text-muted-foreground">{fileName} · {rows.length} صف · اختر العمود المقابل لكل حقل.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map(field => (
                <label key={field.key} className="space-y-1 text-sm">
                  <span className="font-semibold">{field.label}{field.required ? " *" : ""}</span>
                  <select className="w-full rounded-lg border border-border bg-background p-3" value={mapping[field.key]} onChange={event => setMapping(old => ({ ...old, [field.key]: event.target.value }))}>
                    <option value="">-- تجاهل العمود --</option>
                    {columns.map(column => <option key={column} value={column}>{column}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-sm">
              <p>معاينة أول 5 صفوف:</p>
              <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr>{FIELDS.filter(field => mapping[field.key]).map(field => <th key={field.key} className="p-2 text-right">{field.label}</th>)}</tr></thead><tbody>{rows.slice(0,5).map((row,index) => <tr key={index} className="border-t border-border">{FIELDS.filter(field => mapping[field.key]).map(field => <td key={field.key} className="p-2">{String(row[mapping[field.key]] ?? "")}</td>)}</tr>)}</tbody></table></div>
            </div>
            <p className="text-xs text-muted-foreground">الوحدات التي لا تحتوي على اسم ورقم جوال ستُنشأ بدون عميل. لا يمكن ربط الوحدة بأكثر من عميل.</p>
            {errorText && <p className="whitespace-pre-wrap text-sm text-destructive">{errorText}</p>}
            <div className="flex flex-wrap gap-2"><Button onClick={() => void importStructure()} disabled={busy}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />} تأكيد الاستيراد</Button><Button variant="outline" onClick={() => setStep("upload")}>تغيير الملف</Button></div>
          </section>
        )}

        {step === "warranty" && (
          <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h2 className="text-lg font-bold">تم استيراد الهيكل الأساسي للمشروع</h2>
            {importSummary && <p className="text-sm text-muted-foreground">بلوكات جديدة: {importSummary.blocksCreated} · وحدات جديدة: {importSummary.unitsCreated} · روابط عملاء: {importSummary.clientsLinked}</p>}
            <h3 className="font-semibold">هل تريد استيراد الضمانات من ملف منفصل؟</h3>
            <p className="text-sm text-muted-foreground">الخطوة اختيارية. ارفع ملفًا يحتوي على رقم الوحدة وتاريخ التسليم أو انتهاء الضمان، أو تخطَّ الخطوة.</p>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border p-5"><Upload className="h-5 w-5" /><span>{warrantyFile?.name || "اختيار ملف الضمانات"}</span><input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={event => setWarrantyFile(event.target.files?.[0] || null)} /></label>
            {errorText && <p className="whitespace-pre-wrap text-sm text-destructive">{errorText}</p>}
            <div className="flex flex-wrap gap-2"><Button onClick={() => void importWarranties()} disabled={busy || !warrantyFile}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null} استيراد الضمانات</Button><Button variant="outline" onClick={skipWarranties}>تخطي وإنهاء</Button></div>
          </section>
        )}
      </main>
    </Layout>
  );
}
