// src/components/tickets/UnifiedImportModal.tsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown, FileUp, AlertTriangle, Plus, User, Phone, Loader2, CheckCircle } from 'lucide-react';
import { DataImport, FieldDef } from '@/components/ui/DataImport';
import { Project, Client, TicketType } from '@/types';
import { classifyOnServer, learnFromCorrection, getAuthHeaders } from '@/services/classificationApi';
import { ticketsApi, clientsApi } from '@/lib/api';
import { parseIssuedAt } from './TicketTable';
import { format } from 'date-fns';
import { toast } from 'sonner';

// --- Helper functions ---
const normalizeDate = (dateStr: unknown): string => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  // Handle Date objects
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    return dateStr.toISOString().split('T')[0];
  }
  // Handle numbers (Excel serial dates or timestamps)
  if (typeof dateStr === 'number') {
    if (dateStr > 1000 && dateStr < 100000) {
      const d = new Date((dateStr - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    const d = new Date(dateStr > 9999999999 ? dateStr : dateStr * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return new Date().toISOString().split('T')[0];
  }
  // Force to string for everything else
  const str = String(dateStr);
  if (!str) return new Date().toISOString().split('T')[0];
  const parts = str.split('/');
  if (parts.length === 3) {
    let [day, month, year] = parts;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return str.split('T')[0];
};

const normalizeStatus = (rawStatus: unknown): string => {
  // Empty / null / undefined / None → open
  if (rawStatus === null || rawStatus === undefined) return 'open';
  const s = String(rawStatus).toLowerCase().trim();
  if (!s || s === 'none' || s === 'null' || s === 'مفتوح' || s === 'open' || s === 'نشط') return 'open';
  // All closed variants from Excel sheets
  if (
    s === 'مغلق' || s === 'مغلوق' || s === 'اغلاق' || s === 'إغلاق' ||
    s === 'closed' || s === 'close' || s === 'done' || s === 'تم' ||
    s === 'منتهي' || s === 'منتهى' || s === 'مكتمل' || s === 'مكتملة' ||
    s === 'مكتمله' || s === 'completed' || s === 'out_of_scope' ||
    s.startsWith('مغلق') // catches 'مغلق ' with trailing space
  ) return 'closed';
  return 'open';
};

const normalizeVillaNumber = (raw: string): string => {
  if (!raw) return '';
  let cleaned = raw.replace(/[^0-9]/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  return cleaned || raw.trim();
};

/**
 * Resolves Arabic type names from the Excel "تصنيف التذاكر" column
 * to system type keys by matching against DB type nameAr values.
 * Handles comma/slash-separated multi-type strings like "سباكة، سيراميك"
 */
const resolveExcelTypes = (
  rawExcelType: string,
  serverTypes: { key: string; nameAr: string }[],
): string[] => {
  if (!rawExcelType || rawExcelType === 'nan' || rawExcelType === 'undefined') return [];
  const parts = rawExcelType.split(/[،,\/]/g).map(p => p.trim()).filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    const match = serverTypes.find(
      t => t.nameAr === part || t.nameAr.includes(part) || part.includes(t.nameAr),
    );
    if (match && !resolved.includes(match.key)) resolved.push(match.key);
  }
  return resolved;
};

// --- Add Client Inline Modal ---
interface QuickAddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  villaNumber: string;
  onClientCreated: (client: Client) => void;
}

const QuickAddClientModal: React.FC<QuickAddClientModalProps> = ({
  isOpen, onClose, projectId, villaNumber, onClientCreated
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setName('');
      setPhone('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      toast.error('يرجى إدخال اسم العميل ورقم الهاتف');
      return;
    }
    setLoading(true);
    try {
      const newClient = await clientsApi.create(projectId, {
        name,
        phone,
        villaNumber,
        projectId,
        createdAt: new Date().toISOString()
      });
      toast.success(`تم إضافة العميل ${name} بنجاح`);
      onClientCreated(newClient);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل إضافة العميل';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[400px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-white text-right flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-400" />
            إضافة عميل جديد
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="bg-white/5 rounded-xl p-3 text-right text-sm">
            <span className="text-slate-500">رقم الفيلا: </span>
            <span className="text-white font-bold">{villaNumber}</span>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">اسم العميل</Label>
            <div className="relative">
              <Input
                placeholder="مثال: محمد أحمد"
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-11 text-right pr-12"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <User className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهاتف</Label>
            <div className="relative">
              <Input
                placeholder="05xxxxxxx"
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-11 text-right pr-12 font-mono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>
          <div className="flex justify-start gap-3 pt-2">
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 rounded-xl h-11 font-bold">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة وربط التذاكر'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} className="text-slate-500 hover:text-white rounded-xl h-11">
              إلغاء
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};



// ── حاوية لكل بطاقة في الـ Review (عشان قواعد الـ Hooks) ──────────────
interface ReviewTicketCardProps {
  ticket: any;
  index: number;
  projectId: string;
  typeTranslations: Record<string, string>;
  allSupervisors: { id: string; name: string }[];
  onUpdate: (updated: any) => void;
}

const ReviewTicketCard: React.FC<ReviewTicketCardProps> = ({
  ticket, index, projectId, typeTranslations, allSupervisors, onUpdate,
}) => {
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>(
    ticket.detectedTypes || [ticket.type || 'plumbing']
  );
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>(
    ticket.assignedSupervisorIds || []
  );

  const updateTypes = (newTypes: TicketType[]) => {
    setTicketTypes(newTypes);
    const firstType = newTypes[0] || 'plumbing';
    classifyOnServer({
      description: ticket.description || firstType,
      projectId,
    }).then(result => {
      const valid = result.supervisors.filter((s: any) => !s.id.startsWith('pending_'));
      setSelectedSupervisorIds(valid.map((s: any) => s.id));
      onUpdate({
        ...ticket,
        detectedTypes: newTypes,
        type: firstType,
        assignedSupervisorIds: valid.map((s: any) => s.id),
        assignedSupervisors: valid,
        assigneeName: valid[0]?.name || '',
        assignedSupervisorId: valid[0]?.id || null,
      });
    }).catch(() => {});
  };

  const toggleSupervisor = (supId: string) => {
    const newIds = selectedSupervisorIds.includes(supId)
      ? selectedSupervisorIds.filter(id => id !== supId)
      : [...selectedSupervisorIds, supId];
    setSelectedSupervisorIds(newIds);
    const selectedSups = allSupervisors.filter(s => newIds.includes(s.id));
    onUpdate({
      ...ticket,
      assignedSupervisorIds: newIds,
      assignedSupervisors: selectedSups,
      assigneeName: selectedSups[0]?.name || '',
      assignedSupervisorId: selectedSups[0]?.id || null,
    });
  };

  return (
    <div className="border border-border/60 rounded-xl p-4 bg-white/[0.02] space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div><span className="text-slate-500">رقم التذكرة:</span><span className="text-white font-bold mr-1">{ticket.ticketId || '—'}</span></div>
        <div><span className="text-slate-500">فيلا:</span><span className="text-white font-bold mr-1">{ticket.cleanVillaNumber || '—'}</span></div>
        <div className="col-span-2"><span className="text-slate-500">العميل:</span><span className="text-white mr-1">{ticket.clientName || 'غير معروف'}</span></div>
        <div className="col-span-4 text-xs text-slate-400 line-clamp-2">{ticket.description}</div>
        {ticket.subType && (
          <div className="col-span-4 mt-1">
            <span className="text-slate-500 text-[10px] font-bold uppercase block text-right">النوع الفرعي المكتشف</span>
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-white/90 border border-border">
              {ticket.subType}
            </span>
          </div>
        )}
      </div>

      {/* Types selector */}
      <div>
        <Label className="text-slate-500 text-[10px] font-bold uppercase block text-right mb-1">التخصص</Label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(typeTranslations) as [string, string][]).map(([typeKey, typeLabel]) => (
            <button
              key={typeKey}
              type="button"
              onClick={() => {
                const t = typeKey as TicketType;
                const newTypes = ticketTypes.includes(t)
                  ? (ticketTypes.length > 1 ? ticketTypes.filter(x => x !== t) : ticketTypes)
                  : [...ticketTypes, t];
                updateTypes(newTypes);
              }}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${
                ticketTypes.includes(typeKey as TicketType)
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                  : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
              }`}
            >
              {typeLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Supervisors multi-select */}
      <div>
        <Label className="text-slate-500 text-[10px] font-bold uppercase block text-right mb-1">
          المشرفون المختصون {allSupervisors.length > 0 ? `(${allSupervisors.length})` : ''}
        </Label>
        {allSupervisors.length === 0 ? (
          <p className="text-[10px] text-slate-600 text-right">لا يوجد مشرفون في هذا المشروع</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allSupervisors.map(sup => (
              <button
                key={sup.id}
                type="button"
                onClick={() => toggleSupervisor(sup.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  selectedSupervisorIds.includes(sup.id)
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
                }`}
              >
                {sup.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main Component ---
interface UnifiedImportModalProps {
  trigger: React.ReactElement;
  projects: Project[];
  clients: Client[];
  onImportSuccess: () => void;
  currentUserId?: string;
}

export function UnifiedImportModal({ trigger, projects, clients, onImportSuccess, currentUserId }: UnifiedImportModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const hasClientsInProject = selectedProjectId && clients.some(c => c.projectId === selectedProjectId);
  const projectAbbr = selectedProject?.abbreviation?.toUpperCase() || '';

    const fieldDefs: FieldDef[] = [
    { key: 'ticketId',    label: 'رقم التذكرة', aliases: ['ID', 'id', 'رقم التذكرة', 'الرقم', '#', 'رقم الطلب', 'Case Number', 'case number'], required: true },
    { key: 'villaNumber', label: 'رقم الفيلا',  aliases: ['فيلا', 'villa', 'رقم الوحدة', 'الوحدة', 'Unit', 'unit', 'رقم الفيلا'] },
    { key: 'createdAt',   label: 'تاريخ الإنشاء', aliases: ['التاريخ', 'date', 'تاريخ التذكرة', 'تاريخ الإنشاء', 'issuedAt', 'Opened Date', 'opened date'] },
    { key: 'description', label: 'الوصف',        aliases: ['الوصف', 'وصف', 'description', 'المشكلة', 'تفاصيل المشكلة', 'الملاحظات', 'ملاحظات'] },
    { key: 'status',      label: 'الحالة',       aliases: ['الحالة', 'status', 'حالة التذكرة', 'حالة الاغلاق', 'حالة الإغلاق', 'حالةالإغلاق', 'حالةالاغلاق'] },
    { key: 'closedAt',    label: 'تاريخ الإغلاق', aliases: ['تاريخ الإغلاق', 'تاريخ الاغلاق', 'تاريخ الغلق', 'closed date', 'close date', 'تاريخالاغلاق', 'تاريخالإغلاق'] },
    { key: 'excelType',   label: 'التصنيف (من الملف)', aliases: ['تصنيف التذاكر', 'التصنيف', 'نوع التذاكر', 'نوع المشكلة', 'النوع', 'الفئة', 'type', 'category'] },
  ];

  // New: Review modal state — combined matched + unmatched with editable fields
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTickets, setReviewTickets] = useState<any[]>([]);
  const [allSupervisorsForProject, setAllSupervisorsForProject] = useState<{id: string; name: string}[]>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);

    const handleImport = async (data: any[]) => {
    if (!selectedProjectId) {
      toast.error('يرجى اختيار المشروع أولاً');
      return;
    }
    if (!hasClientsInProject) {
      toast.error('لا يوجد عملاء في هذا المشروع. أضف عملاء أولاً.');
      return;
    }

    setLoading(true);
    setProgress(0);
    const allClientsArr = clients.filter(c => c.projectId === selectedProjectId);
    const normalizedClientsMap = new Map(allClientsArr.map(c => [normalizeVillaNumber(String(c.villaNumber)), c]));

    // ── جلب ticketIds الموجودة مباشرة (خفيف وسريع) ──
    let existingTickets: { ticketId: string; id: string; type: string; status: string; closedAt: string | null }[] = [];
    try {
      existingTickets = await ticketsApi.getTicketIds(selectedProjectId);
    } catch { existingTickets = []; }
    const existingTicketIds = new Set(existingTickets.map(t => String(t.ticketId || '').trim()).filter(Boolean));

    // ── جلب كل المشرفين لهذا المشروع (للواجهة فقط) ──
    setLoadingSupervisors(true);
    const { usersApi } = await import('@/lib/api');
    const allUsers = await usersApi.getAll();
    let projectSupervisors = allUsers.filter(
      (u: any) => u.role === 'supervisor' && Array.isArray(u.projectIds) && u.projectIds.includes(selectedProjectId)
    );
    if (projectSupervisors.length === 0) {
      projectSupervisors = allUsers.filter((u: any) => u.role === 'supervisor');
    }
    setAllSupervisorsForProject(projectSupervisors.map((u: any) => ({ id: u.uid, name: u.displayName })));
    setLoadingSupervisors(false);

    // ── الفرز المسبق للتذاكر (استبعاد المكرر قبل التصنيف) ──
    // لا نصنف تلقائيًا من الكلمات المفتاحية — نكتفي بعمود الملف أو unclassified
    // (الـ GeminiWorker سيصنف unclassified في الخلفية)
    const preProcessedData = data.map((item, idx) => {
      const ticketId = String(item.ticketId || '').trim();
      const rawVillaNumber = String(item.villaNumber || '').trim();
      const cleanVillaNumber = normalizeVillaNumber(rawVillaNumber);
      const isDuplicate = Boolean(ticketId && existingTicketIds.has(ticketId));
      return { ...item, cleanVillaNumber, isDuplicate, ticketId, rawVillaNumber };
    });

    // ── تجهيز التذاكر ──
    const processed: any[] = [];
    for (let idx = 0; idx < data.length; idx++) {
      const item = preProcessedData[idx];
      const ticketId = item.ticketId;
      const rawVillaNumber = item.rawVillaNumber;
      const description = String(item.description || '').trim();
      const rawDate = item.createdAt ?? item.issuedAt ?? item.date ?? '';
      const rawStatus = String(item.status || '').trim();

      const cleanVillaNumber = item.cleanVillaNumber;
      const refNumber = cleanVillaNumber ? `${projectAbbr}-${cleanVillaNumber}` : '';

      // الكشف عن المكرر تم مسبقاً
      const isDuplicate = item.isDuplicate;

      // حل التصنيف — المصدر الوحيد الموثوق في الاستيراد هو عمود الملف
      // لا نستخدم keyword classifier (متحيز لـ doors_windows + plumbing)
      // التذاكر بدون تصنيف في الملف → unclassified، GeminiWorker يعالجها
      const excelTypesResolved = resolveExcelTypes(String(item.excelType || ''), serverTypes);
      const finalAllTypes = excelTypesResolved.length > 0 ? excelTypesResolved : [];
      const finalType = excelTypesResolved[0] || 'unclassified';
      const finalTypeId    = null;
      const finalSubTypeId = null;

      let clientId = '';
      let clientName = '';
      if (cleanVillaNumber) {
        const matchedClient = normalizedClientsMap.get(cleanVillaNumber);
        if (matchedClient) {
          clientId = matchedClient.id;
          clientName = matchedClient.name;
        }
      }

      // لا نعين مشرفين تلقائيًا في الاستيراد — تُعين لاحقًا يدويًا أو بواسطة Gemini
      const validSupervisors: any[] = [];
      const primary = null;
      const supervisorIds: string[] = [];

                        let issuedAtStr = '';
      if (rawDate) {
        // Ensure rawDate is a string or number for parseIssuedAt
        const normalizedRaw = rawDate instanceof Date ? rawDate.toISOString() : rawDate;
        const d = parseIssuedAt(normalizedRaw);
        if (d && !isNaN(d.getTime())) issuedAtStr = format(d, 'yyyy-MM-dd');
        else issuedAtStr = normalizeDate(normalizedRaw);
      } else {
        issuedAtStr = new Date().toISOString().split('T')[0];
      }

            const status = normalizeStatus(rawStatus);

            // ── Handle closing date from Excel ─────────────────────────────
            let closedAtStr: string | null = null;
            const rawClosedAt = item.closedAt;
            if (rawClosedAt !== null && rawClosedAt !== undefined && String(rawClosedAt).trim() !== '') {
              // Excel Date objects come as JS Date from xlsx library
              if (rawClosedAt instanceof Date && !isNaN(rawClosedAt.getTime())) {
                closedAtStr = rawClosedAt.toISOString();
              } else {
                const normalizedClosed = String(rawClosedAt);
                const d = parseIssuedAt(normalizedClosed);
                if (d && !isNaN(d.getTime())) {
                  closedAtStr = d.toISOString();
                } else {
                  const nd = normalizeDate(normalizedClosed);
                  if (nd) {
                    const parsed = new Date(nd);
                    if (!isNaN(parsed.getTime())) closedAtStr = parsed.toISOString();
                  }
                }
              }
            }
            // If status is closed but no closedAt in sheet → use issuedAt as fallback, not current time
            if (status === 'closed' && !closedAtStr) {
              // Prefer the issuedAt date as a minimum, fallback to now
              closedAtStr = issuedAtStr ? new Date(issuedAtStr).toISOString() : new Date().toISOString();
            }

            processed.push({
        ticketId,
        refNumber,
        cleanVillaNumber,
        projectId: selectedProjectId,
        clientId,
        clientName,
        description,
        status,
        closedAt: closedAtStr,
        issuedAt: issuedAtStr,
        assigneeName: primary?.name || '',
        assignedSupervisorId: primary?.id || null,
        assignedSupervisorIds: supervisorIds,
        assignedSupervisors: validSupervisors,
        detectedTypes: finalAllTypes,
        type: finalType,
        typeId: finalTypeId,
        subType: null,
        subTypeId: finalSubTypeId,
        priority: 3,
        createdAt: new Date().toISOString(),
        createdBy: currentUserId || null,
        projectPrefix: projectAbbr,
        isDuplicate,
      });
    }

    const newTickets = processed.filter(t => !t.isDuplicate);
    const duplicates = processed.filter(t => t.isDuplicate);

    const updates: { id: string; status: string; closedAt?: string | null; type?: string; detectedTypes?: string[] }[] = [];
    const existingByTicketId = new Map(existingTickets.map(t => [String(t.ticketId).trim(), t]));
    duplicates.forEach(dup => {
      const existing = existingByTicketId.get(dup.ticketId);
      if (!existing) return;

      const statusChanged = existing.status !== dup.status;
      // إضافة: لو التذكرة الموجودة غير مصنفة والاستيراد عنده تصنيف → حدّث النوع
      const typeNeedsUpdate =
        (!existing.type || existing.type === 'unclassified') &&
        dup.type && dup.type !== 'unclassified';

      if (statusChanged || typeNeedsUpdate) {
        updates.push({
          id: existing.id,
          status: dup.status,
          closedAt: dup.closedAt,
          ...(typeNeedsUpdate ? { type: dup.type, detectedTypes: dup.detectedTypes } : {}),
        });
      }
    });

    // ── لوج المقارنة: ما اتعمل وما اتخطى ──
    const importLog = {
      timestamp: new Date().toISOString(),
      project: selectedProject?.name || selectedProjectId,
      fileRows: data.length,
      uniqueInFile: new Set(data.map((r: any) => String(r.ticketId || '').trim()).filter(Boolean)).size,
      newTickets: newTickets.length,
      duplicatesFound: duplicates.length,
      statusUpdates: 0,
      typeUpdates: 0,
      unchangedDuplicates: 0,
    };

    if (updates.length > 0) {
      try {
        await ticketsApi.bulkUpdateImported(updates);
        importLog.typeUpdates = updates.filter(u => u.type).length;
        importLog.statusUpdates = updates.filter(u => !u.type).length;
        const parts = [];
        if (importLog.statusUpdates > 0) parts.push(`تحديث حالة ${importLog.statusUpdates} تذكرة`);
        if (importLog.typeUpdates > 0) parts.push(`تصنيف ${importLog.typeUpdates} تذكرة غير مصنفة`);
        toast.success(`✅ ${parts.join(' + ')}`);
      } catch (err) {
        toast.error('حدث خطأ أثناء محاولة تحديث التذاكر الموجودة');
      }
    }

    importLog.unchangedDuplicates = duplicates.length - updates.length;
    if (importLog.unchangedDuplicates > 0) {
      toast.info(`↩ ${importLog.unchangedDuplicates} تذكرة موجودة بالفعل ولم تتغير`);
    }

    // إرسال اللوج للسيرفر
    fetch('/api/tickets/import-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(importLog),
    }).catch(() => {});

    if (newTickets.length === 0) {
      if (updates.length > 0) {
        setOpen(false);
        onImportSuccess();
      } else {
        // تقرير تفصيلي لما مفيش جديد
        toast.info(
          `📊 تقرير الاستيراد:\n` +
          `• في الملف: ${importLog.fileRows} صف (${importLog.uniqueInFile} فريد)\n` +
          `• موجودة مسبقًا: ${importLog.duplicatesFound}\n` +
          `• لا يوجد تذاكر جديدة للإضافة`
        );
      }
      setLoading(false);
      return;
    }

    // Close the import dialog first to avoid Radix UI dialog conflicts
    setOpen(false);

    // Small delay to let Radix close the parent dialog cleanly
    setTimeout(() => {
      setReviewTickets(newTickets);
      setOriginalTypesMap(
        Object.fromEntries(newTickets.map((t: any) => [
          t.ticketId || t.refNumber,
          Array.isArray(t.detectedTypes) && t.detectedTypes.length > 0
            ? [...t.detectedTypes]
            : t.type && t.type !== 'unclassified' ? [t.type] : [],
        ]))
      );
      setReviewModalOpen(true);
      setLoading(false);
    }, 200);
  };

  // ── حفظ الأنواع الأصلية لكل تذكرة (لتعليم السيرفر عند التعديل) ──
  const [originalTypesMap, setOriginalTypesMap] = useState<Record<string, string[]>>({});

    // ── جلب أنواع التذاكر من السيرفر بدلاً من الـ hardcoded map ──
  const [serverTypes, setServerTypes] = useState<{ key: string; nameAr: string }[]>([]);
  useEffect(() => {
    fetch('/api/classify/types', {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then((types: any[]) => {
        setServerTypes(types.map(t => ({ key: t.key, nameAr: t.nameAr })));
      })
      .catch(() => {
        // Fallback to hardcoded map if API fails
        setServerTypes(Object.entries(FALLBACK_TYPE_TRANSLATIONS).map(([key, nameAr]) => ({ key, nameAr })));
      });
  }, []);

  const FALLBACK_TYPE_TRANSLATIONS: Record<string, string> = {
    'electricity': 'كهرباء', 'plumbing': 'سباكة', 'doors': 'أبواب',
    'paints': 'دهانات', 'painting': 'دهانات', 'cracks': 'تشققات',
    'ceramics': 'سيراميك', 'tiles': 'سيراميك', 'tank_insulation': 'عزل خزان',
    'drainage': 'صرف صحي', 'ac_ventilation': 'تكييف وتهوية', 'pumps': 'مضخات',
    'doors_windows': 'أبواب ونوافذ', 'waterproofing': 'عزل مائي',
    'grading': 'ميول وترويبة', 'pest_control': 'مكافحة حشرات',
    'cleaning': 'تنظيف', 'structural': 'إنشائي',
  };
  const typeTranslations = Object.fromEntries(serverTypes.map(t => [t.key, t.nameAr]));
  const allTypeOptions = serverTypes.map(t => t.key);

  const finalizeImport = async (ticketsToSave: any[]) => {
    const payload = ticketsToSave.map(t => ({
      ticketId: t.ticketId,
      refNumber: t.refNumber,
      projectId: t.projectId,
      clientId: t.clientId,
      clientName: t.clientName,
      villaNumber: t.cleanVillaNumber,
            description: t.description,
      status: t.status,
      closedAt: t.closedAt,
      priority: Number(t.priority) || 3,
      issuedAt: t.issuedAt,
      createdAt: t.createdAt,
      type: t.type,
      typeId: t.typeId ?? null,
      detectedTypes: t.detectedTypes,
      subType: t.subType,
      subTypeId: t.subTypeId ?? null,
      assigneeName: t.assigneeName,
      assignedSupervisorId: t.assignedSupervisorId,
      assignedSupervisorIds: t.assignedSupervisorIds,
      assignedSupervisors: t.assignedSupervisors,
      createdBy: t.createdBy,
    }));

      const BATCH_SIZE = 50;
      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;
  
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        try {
          const res = await ticketsApi.bulkCreate(batch);
          const insertedCount = res.count ?? batch.length;
          successCount += insertedCount;
          if (insertedCount < batch.length) {
            skippedCount += (batch.length - insertedCount);
          }
        } catch (err) {
          failCount += batch.length;
        }
        setProgress((i + batch.length) / payload.length);
      }

        if (failCount === 0) {
      // ── تعليم السيرفر من التعديلات ──
      const learnPromises: Promise<any>[] = [];
      for (const t of ticketsToSave) {
        const key = t.ticketId || t.refNumber;
        const originalTypes = originalTypesMap[key] || [];
        const newTypes: string[] = Array.isArray(t.detectedTypes) && t.detectedTypes.length > 0
          ? t.detectedTypes
          : [t.type || 'plumbing'];

        const origSorted = [...originalTypes].sort();
        const newSorted = [...newTypes].sort();
        const changed =
          origSorted.length !== newSorted.length ||
          origSorted.some((o, i) => o !== newSorted[i]);

        if (changed && newSorted.length > 0 && t.description) {
          learnPromises.push(
            learnFromCorrection(t.description, newSorted[0])
              .catch(() => { /* تعلم فاشل لا يمنع نجاح الاستيراد */ })
          );
        }
      }
      if (learnPromises.length > 0) {
        Promise.allSettled(learnPromises).then(results => {
          const learned = results.filter(r => r.status === 'fulfilled').length;
          if (learned > 0) console.log(`[Learn] تم تعلم ${learned} تصنيفات من الاستيراد`);
        });
      }

        if (skippedCount > 0) {
          toast.success(`تم استيراد ${successCount} تذكرة، وتخطي ${skippedCount} مكررة`);
        } else {
          toast.success(`تم استيراد ${successCount} تذكرة بنجاح`);
        }
        setOpen(false);
        setSelectedProjectId('');
        onImportSuccess();
      } else {
        toast.error(`نجح ${successCount}، فشل ${failCount}، وتخطي ${skippedCount} مكررة.`);
      }
  };


  return (
    <>
            <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={trigger} />
        
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[600px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white text-right">استيراد تذاكر صيانة</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase">١. اختر المشروع</Label>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12 mt-1">
                    <ChevronDown className="w-4 h-4 opacity-50" />
                    <span>{selectedProject?.name || 'اختر المشروع'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border w-full">
                  {projects.map(p => (
                    <DropdownMenuItem key={p.id} onClick={() => setSelectedProjectId(p.id)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase">٢. ارفع ملف Excel</Label>
              <div className={selectedProjectId && hasClientsInProject ? '' : 'opacity-50 pointer-events-none'}>
                {!selectedProjectId && <p className="text-amber-400 text-xs text-right mb-2">⚠ اختر المشروع أولاً</p>}
                {selectedProjectId && !hasClientsInProject && (
                  <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-right">
                    <p className="text-amber-300 text-xs">لا يوجد عملاء في هذا المشروع. أضف عملاء أولاً.</p>
                  </div>
                )}

                {/* ── استيراد سريع من السيرفر (للملفات الكبيرة) ── */}
                <div className="mb-3">
                  <label className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-emerald-500/40 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 cursor-pointer transition-all ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex items-center gap-2 text-emerald-400">
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                      <span className="text-sm font-bold">استيراد سريع (موصى به للملفات الكبيرة)</span>
                    </div>
                    <span className="text-xs text-slate-500 mt-1">معالجة على السيرفر — لا يُحمّل الذاكرة</span>
                    <input
                      type="file"
                      accept=".xlsx,.xlsm,.xls,.csv"
                      className="hidden"
                      disabled={!selectedProjectId || !hasClientsInProject || loading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !selectedProjectId) return;
                        e.target.value = '';
                        setLoading(true);
                        setProgress(0.1);
                        try {
                          const result = await ticketsApi.importExcel(file, selectedProjectId);
                          setProgress(1);
                          const parts = [];
                          if (result.added > 0) parts.push(`إضافة ${result.added} تذكرة جديدة`);
                          if (result.updated > 0) parts.push(`تحديث ${result.updated} تذكرة`);
                          if (result.skipped > 0) parts.push(`تخطي ${result.skipped} مكررة`);
                          if (result.failed > 0) parts.push(`فشل ${result.failed}`);
                          toast.success(`✅ ${parts.join(' · ')}`);
                          setOpen(false);
                          setSelectedProjectId('');
                          onImportSuccess();
                        } catch (err: any) {
                          toast.error('فشل الاستيراد: ' + err.message);
                        } finally {
                          setLoading(false);
                          setProgress(0);
                        }
                      }}
                    />
                  </label>
                </div>

                {/* ── استيراد عادي مع مراجعة (للملفات الصغيرة) ── */}
                <DataImport
                  title=""
                  description="الأعمدة المطلوبة: رقم التذكرة، رقم الفيلا، تاريخ الإنشاء، الوصف، الحالة (اختياري)"
                  fieldDefs={fieldDefs}
                  onImport={handleImport}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 border-border text-slate-400 hover:text-white rounded-xl flex items-center justify-center gap-2 text-sm"
                      disabled={!selectedProjectId || !hasClientsInProject}
                    >
                      <FileUp className="w-4 h-4" />
                      استيراد مع مراجعة (ملفات صغيرة)
                    </Button>
                  }
                />
              </div>
            </div>

            {loading && progress > 0 && (
              <div className="w-full bg-white/10 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress * 100}%` }}></div>
                <p className="text-xs text-slate-400 text-right mt-1">جاري الاستيراد... {Math.round(progress * 100)}%</p>
              </div>
            )}

            <div className="bg-white/5 rounded-2xl p-4 text-xs text-right text-slate-400">
              <p className="text-slate-300 font-bold mb-2">يتم تلقائياً:</p>
              <p>• <span className="text-blue-400">نوع الصيانة</span> — من وصف المشكلة</p>
              <p>• <span className="text-blue-400">المسؤول</span> — من مشرفي المشروع حسب التخصص</p>
              <p>• <span className="text-blue-400">العميل</span> — من رقم الفيلا في قاعدة البيانات</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>


            {/* ── Review & Confirm Modal ───────────────────────────────────── */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[900px] max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white text-right flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-blue-500" />
              مراجعة التذاكر الجديدة ({reviewTickets.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-xs text-slate-500 text-right">
              يمكنك تعديل التخصص والمشرفين قبل تأكيد الاستيراد. اختر أكثر من مشرف حسب الحاجة.
            </p>
            {reviewTickets.map((ticket, idx) => (
              <ReviewTicketCard
                key={idx}
                ticket={ticket}
                index={idx}
                projectId={selectedProjectId}
                typeTranslations={typeTranslations}
                allSupervisors={allSupervisorsForProject}
                onUpdate={(updatedTicket) => { reviewTickets[idx] = updatedTicket; }}
              />
            ))}
          </div>
          <div className="flex justify-start gap-3 pt-4 border-t border-border">
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-xl h-11 font-bold"
              onClick={() => {
                finalizeImport(reviewTickets);
                setReviewModalOpen(false);
              }}
            >
              تأكيد واستيراد {reviewTickets.length} تذكرة
            </Button>
            <Button
              variant="ghost"
              onClick={() => setReviewModalOpen(false)}
              className="text-slate-500 hover:text-white rounded-xl h-11"
            >
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}