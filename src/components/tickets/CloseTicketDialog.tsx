import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import {
CheckCircle2,
X,
Plus,
Trash2,
MessageCircle,
Save,
FileText,
Loader2,
Copy,
ExternalLink,
Download,
FileImage,
ChevronDown,
UserX,
Ban,
} from 'lucide-react';
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
Dialog,
DialogContent,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ticket, Client, Project } from '@/types';
import { ticketsApi, projectsApi, whatsappApi } from '@/lib/api';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { WhatsAppService } from '@/services/whatsappService';

// ── IndexedDB helpers for persisting directory handle ──────────────────────
const IDB_NAME = 'tickets-app';
const IDB_STORE = 'fs-handles';
const IDB_KEY = 'save-dir';

function openIdb(): Promise<IDBDatabase> {
return new Promise((resolve, reject) => {
const req = indexedDB.open(IDB_NAME, 1);
req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
req.onsuccess = () => resolve(req.result);
req.onerror = () => reject(req.error);
});
}

async function getSavedDirHandle(): Promise<FileSystemDirectoryHandle | null> {
try {
const db = await openIdb();
return new Promise((resolve) => {
const tx = db.transaction(IDB_STORE, 'readonly');
const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
req.onsuccess = () => resolve(req.result ?? null);
req.onerror = () => resolve(null);
});
} catch { return null; }
}

async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
try {
const db = await openIdb();
return new Promise((resolve) => {
const tx = db.transaction(IDB_STORE, 'readwrite');
tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
tx.oncomplete = () => resolve();
tx.onerror = () => resolve();
});
} catch { /* ignore */ }
}

async function clearDirHandle(): Promise<void> {
try {
const db = await openIdb();
return new Promise((resolve) => {
const tx = db.transaction(IDB_STORE, 'readwrite');
tx.objectStore(IDB_STORE).delete(IDB_KEY);
tx.oncomplete = () => resolve();
tx.onerror = () => resolve();
});
} catch { /* ignore */ }
}

interface CloseTicketDialogProps {
open: boolean;
onOpenChange: (open: boolean) => void;
selectedTickets: Ticket[];
clients: Client[];
projects?: Record<string, Project>;
onSuccess: () => void;
}

function downloadBlob(blob: Blob, fileName: string) {
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = fileName;
a.click();
URL.revokeObjectURL(url);
}

export function CloseTicketDialog({
open,
onOpenChange,
selectedTickets,
clients,
projects,
onSuccess
}: CloseTicketDialogProps) {
const { user } = useAuth();
const privileged = user?.role === 'admin' || user?.role === 'engineer';
const supervisors = [...new Map(selectedTickets.flatMap(t => t.assignedSupervisors || []).map(s => [s.id, s])).values()];
const activeSupervisorIds = [...new Set(selectedTickets.flatMap(t => t.assignedSupervisorIds || []))];
const supervisorOptions = activeSupervisorIds.map(id => supervisors.find(s => s.id === id) || ({ id, name: id } as any));
const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>([]);
const shared = selectedTickets.some(t => (t.assignedSupervisorIds?.length || 0) > 1 || (t.supervisorClosures?.length || 0) > 0);
type CloseType = 'normal' | 'absent' | 'out_of_scope';
const [closeType, setCloseType] = useState<CloseType>('normal');
const [loading, setLoading] = useState(false);
const [copying, setCopying] = useState(false);
const [notes, setNotes] = useState('');
const [showMessagePreview, setShowMessagePreview] = useState(false);
  const [maintItems, setMaintItems] = useState<{ description: string; status: string }[]>(
    selectedTickets.map(t => ({
      description: (t.description || '').replace(/(https?:\/\/[^\s]+)/g, '').trim(),
      status: 'تم'
    }))
  );

  // Display-only value. Unit relationships use unitId.
  const currentVilla = selectedTickets[0]?.unitNumber || '';

const [showSaveModal, setShowSaveModal] = useState(false);
const [savingReport, setSavingReport] = useState<'image' | 'pdf' | null>(null);
const [cardStatus, setCardStatus] = useState('تم');

const [closingMsgTemplate, setClosingMsgTemplate] = useState('');
const [absentMsgTemplate, setAbsentMsgTemplate] = useState('');
const [outOfScopeMsgTemplate, setOutOfScopeMsgTemplate] = useState('');
const [waConnected, setWaConnected] = useState<boolean | null>(null);

React.useEffect(() => {
if (open) {
setCloseType('normal');
setSelectedSupervisorIds(
  privileged
    ? activeSupervisorIds
    : user?.uid && activeSupervisorIds.includes(user.uid)
      ? [user.uid]
      : []
);
setWaConnected(null);
WhatsAppService.getTemplates().then(t => {
setClosingMsgTemplate(t.closingMsg);
setAbsentMsgTemplate(t.absentMsg || '');
setOutOfScopeMsgTemplate(t.outOfScopeMsg || '');
});
whatsappApi.getStatus().then(s => setWaConnected(s.connected)).catch(() => setWaConnected(false));
}
}, [open, privileged, user?.uid, selectedTickets]);

const currentUnitId = selectedTickets[0]?.unitId;
const targetClient = clients.find(c => String(c.unitId) === String(currentUnitId));
const mainTicket = selectedTickets[0];
const waIds = selectedTickets.map(t => t.ticketId || t.refNumber).join('، ');

const msgParams = {
clientName: targetClient?.name || mainTicket?.clientName || '',
ticketId: waIds,
description: mainTicket?.description || '',
unitNumber: targetClient?.unitNumber || mainTicket?.unitNumber || '',
closureNotes: notes || 'تم الإنجاز',
date: new Date().toLocaleDateString('ar-SA'),
};
const previewMessage =
closeType === 'absent' ? WhatsAppService.processTemplate(absentMsgTemplate, msgParams) :
closeType === 'out_of_scope' ? WhatsAppService.processTemplate(outOfScopeMsgTemplate, msgParams) :
WhatsAppService.processTemplate(closingMsgTemplate, msgParams);

const effectiveSelectedSupervisorIds = privileged
  ? selectedSupervisorIds.filter(id => activeSupervisorIds.includes(id))
  : user?.uid && activeSupervisorIds.includes(user.uid)
    ? [user.uid]
    : [];
const isFullNormalClosure =
  closeType === 'normal' &&
  (activeSupervisorIds.length === 0
    ? privileged
    : effectiveSelectedSupervisorIds.length === activeSupervisorIds.length);
const closureModeText = isFullNormalClosure
  ? 'إغلاق كامل — سيتم إنشاء التقرير وإرساله للعميل'
  : `إغلاق جزئي — سيتم إنهاء ${effectiveSelectedSupervisorIds.length} من ${activeSupervisorIds.length} دور ولن يُرسل التقرير الآن`;

const toggleSupervisor = (id: string) => {
  if (!privileged) return;
  setSelectedSupervisorIds(current =>
    current.includes(id) ? current.filter(uid => uid !== id) : [...current, id]
  );
};

// Sync items if selectedTickets changes
React.useEffect(() => {
setMaintItems(selectedTickets.map(t => ({ description: (t.description || '').replace(/(https?:\/\/[^\s]+)/g, '').trim(), status: 'تم' })));
}, [selectedTickets]);



const addMaintItem = () => {
setMaintItems([...maintItems, { description: '', status: 'تم' }]);
};

const removeMaintItem = (index: number) => {
setMaintItems(maintItems.filter((_, i) => i !== index));
};

const updateItem = (index: number, field: 'description' | 'status', value: string) => {
const newItems = [...maintItems];
newItems[index] = { ...newItems[index], [field]: value };
setMaintItems(newItems);
};

const isMobileDevice = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
// projectName resolved at submit time via getDoc fallback (avoids collection-list permission issues)
const staticProjectName = selectedTickets[0]?.projectId
? projects?.[selectedTickets[0].projectId]?.name
: undefined;

// ── بناء بيانات التقرير ──────────────────────────────────────────────────
const buildReportPayload = async () => {
let projectName = staticProjectName;
if (!projectName && mainTicket?.projectId) {
try {
const project = await projectsApi.get(mainTicket.projectId);
if (project) projectName = (project as Project).name;
} catch { /* ignore */ }
}
const priorityMap: Record<string, string> = {
low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة جداً',
'3': 'منخفضة', '4': 'عادية', '6': 'متوسطة', '7': 'عالية', '9': 'عاجلة جداً',
};
const priorityLabel = mainTicket?.priority
? (priorityMap[String(mainTicket.priority)] || String(mainTicket.priority))
: 'الأولوية';
return {
ticket_num: selectedTickets.map(t => t.ticketId || t.refNumber).join('، '),
villa: mainTicket?.unitNumber || '',
customer_name: targetClient?.name || mainTicket?.clientName || '',
phone: targetClient?.phone || '',
maint_items: maintItems.map(item => [item.description, item.status]),
notes,
block: targetClient?.blockNumber || '',
project: projectName || '',
ticket_date: mainTicket?.issuedAt || '',
priority: priorityLabel,
nhc: mainTicket?.projectAbbr || mainTicket?.refNumber?.split('-')[0] || '',
status: cardStatus,
};
};

// ── حفظ التقرير فقط (بدون إغلاق تذاكر أو إرسال رسائل) ──────────────────
const handleSaveReportOnly = async (format: 'image' | 'pdf') => {
if (maintItems.length === 0) {
toast.error('يرجى إضافة بند صيانة واحد على الأقل');
return;
}
setSavingReport(format);
try {
const payload = await buildReportPayload();
const authToken = localStorage.getItem('retal_auth_token');
const response = await fetch('/api/generate-report', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) { toast.error('فشل إنشاء التقرير'); return; }
        const blob = await response.blob();
        const firstTicketNo = selectedTickets[0]?.ticketId || selectedTickets[0]?.refNumber || 'ticket';
        const baseName = `${mainTicket?.unitNumber || 'villa'}-${firstTicketNo}`;
        if (format === 'image') {
          downloadBlob(blob, `${baseName}.jpg`);
          toast.success('تم تحميل التقرير كصورة ✅');
setShowSaveModal(false);
} else {
const { jsPDF } = await import('jspdf');
const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
const imgUrl = URL.createObjectURL(blob);
await new Promise<void>((resolve) => {
const img = new Image();
img.onload = () => {
const pageW = pdf.internal.pageSize.getWidth();
const pageH = pdf.internal.pageSize.getHeight();
const imgAspect = img.width / img.height;
const pdfW = pageW - 20;
const pdfH = pdfW / imgAspect;
pdf.addImage(imgUrl, 'JPEG', 10, 10, pdfW, Math.min(pdfH, pageH - 20));
pdf.save(`${baseName}.pdf`);
resolve();
};
img.src = imgUrl;
});
toast.success('تم تحميل التقرير كـ PDF ✅');
setShowSaveModal(false);
}
} catch {
toast.error('فشل تحميل التقرير');
} finally {
setSavingReport(null);
}
};

const handleSpecialClose = async () => {
if (closeType === 'normal') return;
if (shared) {toast.error('التذكرة مشتركة؛ استخدم إنهاء الدور أو الإغلاق الكامل'); return;}
setLoading(true);
try {
const isWhatsAppSent = targetClient?.phone && previewMessage;

// إرسال رسالة الواتساب المجمعة أولاً
if (isWhatsAppSent) {
try {
await whatsappApi.send(targetClient.phone, previewMessage);
} catch (e: any) {
toast.error(`تعذر إرسال رسالة الواتساب:${e.message || 'خطأ غير معروف'}`);
setLoading(false);
return;
}
} else if (previewMessage && !targetClient?.phone) {
toast.error("لا يوجد رقم هاتف مسجل للعميل لإرسال الرسالة.");
setLoading(false);
return;
}

// إغلاق التذاكر وتحديث الحالة
await Promise.all(selectedTickets.map(ticket =>
ticketsApi.update(ticket.id, {
status: closeType,
closedAt: new Date().toISOString(),
closureNotes: notes || (closeType === 'absent' ? 'إغلاق لعدم تواجد العميل' : 'إغلاق خارج الاختصاص')
})
));

const label = closeType === 'absent' ? 'عدم التواجد' : 'خارج الاختصاص';
toast.success(`تم إغلاق التذاكر (${label})${isWhatsAppSent ? ' وإرسال الرسالة 💬' : ''}`);
onSuccess();
onOpenChange(false);
} catch {
toast.error('فشل إغلاق التذاكر');
} finally {
setLoading(false);
}
};

const handleSubmit = async () => {
if (closeType !== 'normal') { if (shared) {toast.error('التذكرة مشتركة؛ استخدم إنهاء الدور أو الإغلاق الكامل'); return;} handleSpecialClose(); return; }

if (maintItems.length === 0) {
toast.error('يرجى إضافة بند صيانة واحد على الأقل');
return;
}
if (privileged && effectiveSelectedSupervisorIds.length === 0 && activeSupervisorIds.length > 0) {
toast.error('حدد مشرفًا واحدًا على الأقل');
return;
}
if (privileged && !notes.trim()) {
toast.error('اكتب سبب الإغلاق أو الإنهاء بالنيابة في الملاحظات');
return;
}

setLoading(true);
setCopying(true);

try {
const authToken = localStorage.getItem('retal_auth_token');
const response = await fetch('/api/tickets/close', {
  method: 'POST', headers: {'Content-Type': 'application/json', ...(authToken ? {Authorization: `Bearer ${authToken}`} : {})},
  body: JSON.stringify({
    ticketIds: selectedTickets.map(t => t.id),
    scope: privileged
      ? (isFullNormalClosure ? 'all' : 'selected')
      : 'self',
    supervisorUids: privileged && !isFullNormalClosure ? effectiveSelectedSupervisorIds : undefined,
    notes,
    items: maintItems,
  }),
});
if (!response.ok) {
  const error = await response.json().catch(() => ({}));
  toast.error(error.error || 'فشل إنهاء الدور'); return;
}
if (response.headers.get('content-type')?.includes('application/json')) {
  toast.success(isFullNormalClosure
    ? 'تم الإغلاق الكامل ووضع التقرير في طابور الإرسال'
    : 'تم الإغلاق الجزئي؛ التقرير سيُرسل بعد إنهاء باقي المشرفين');
  onSuccess(); onOpenChange(false); return;
}
const blob = await response.blob();

const firstTicketNo = selectedTickets[0]?.ticketId || selectedTickets[0]?.refNumber || 'ticket';
const fileName = `${mainTicket?.unitNumber || 'villa'}-${firstTicketNo}.jpg`;
let saved = false;

// We no longer automatically download the blob to avoid cluttering the user's PC.
// If the user picked a folder via directory picker, we still save it there silently.
const dirHandle = await getSavedDirHandle();
if (dirHandle) {
try {
const perm = await (dirHandle as any).requestPermission({ mode: 'readwrite' });
if (perm === 'granted') {
const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
const writable = await fileHandle.createWritable();
await writable.write(blob);
await writable.close();
toast.success(`تم حفظ التقرير في ${dirHandle.name}/${fileName}`);
}
} catch {
await clearDirHandle();
}
}

const isWhatsAppSent = targetClient?.phone && previewMessage;
toast.success(`تم حفظ الأدوار وإغلاق التذاكر المكتملة${isWhatsAppSent ? ' — التقرير النهائي في طابور الإرسال 💬' : ''}`);
onSuccess();
onOpenChange(false);
} catch (error) {
console.error('Error closing tickets:', error);
toast.error('فشل إغلاق التذاكر');
} finally {
setLoading(false);
setCopying(false);
}
};

return (
<>
<Dialog open={open} onOpenChange={onOpenChange}>
<DialogContent className="bg-card border-border text-slate-200 w-[calc(100vw-1rem)] sm:w-full sm:max-w-[700px] rounded-[26px] sm:rounded-3xl shadow-2xl shadow-black/40 max-h-[96dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
<DialogHeader>
<div className="flex items-center gap-2.5 mb-1 justify-start">
<div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
<CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
</div>
<DialogTitle className="text-lg sm:text-xl font-bold text-white text-right">إقفال التذاكر المختارة</DialogTitle>
</div>
<div className="text-right p-3 sm:p-4 bg-white/5 rounded-2xl border border-white/5 space-y-0.5 sm:space-y-1">
<div className="text-xs text-slate-500 font-bold uppercase tracking-widest">
فيلا رقم {selectedTickets[0]?.unitId ? (
  <Link to={`/units/${selectedTickets[0].unitId}`} className="hover:underline hover:text-blue-300 transition-colors">{currentVilla}</Link>
) : currentVilla}
</div>
<div className="text-sm font-bold text-blue-400 space-x-1 space-x-reverse">
{selectedTickets.map((t, i) => (
  <React.Fragment key={t.id}>
    {i > 0 && ' ، '}
    <Link to={`/tickets/${t.id}`} className="hover:underline hover:text-blue-300 transition-colors">#{t.ticketId || t.refNumber}</Link>
  </React.Fragment>
))}
</div>
</div>
</DialogHeader>
<div className="rounded-2xl border border-border bg-muted/10 p-3 text-right space-y-3">
<div className="flex items-center justify-between gap-3">
<div>
<p className="text-xs font-black text-foreground">المشرفون الجاري إنهاء أدوارهم</p>
<p className="mt-0.5 text-[11px] text-muted-foreground">
{privileged ? 'حدد مباشرةً المشرفين المطلوب إنهاء أدوارهم' : 'يمكنك إنهاء دورك فقط'}
</p>
</div>
<span className={cn(
  'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black border',
  isFullNormalClosure
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
)}>
{isFullNormalClosure ? 'إغلاق كامل' : 'إغلاق جزئي'}
</span>
</div>

{supervisorOptions.length > 0 ? (
<div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
{supervisorOptions.map(s => {
  const checked = effectiveSelectedSupervisorIds.includes(s.id);
  const canToggle = privileged;
  return (
    <button
      key={s.id}
      type="button"
      disabled={!canToggle}
      onClick={() => toggleSupervisor(s.id)}
      className={cn(
        'flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-right transition-all',
        checked
          ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground'
          : 'border-border bg-background/50 text-muted-foreground',
        canToggle && 'active:scale-[0.99]'
      )}
    >
      <span className="min-w-0 truncate text-sm font-bold">{s.name}</span>
      <span className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-black',
        checked
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-border bg-background text-transparent'
      )}>✓</span>
    </button>
  );
})}
</div>
) : (
<div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
لا يوجد مشرف نشط على التذكرة — سيتم الإغلاق بواسطة الإدارة.
</div>
)}

{selectedTickets.some(t => (t.supervisorClosures || []).some(h => !t.assignedSupervisorIds?.includes(h.supervisorUid))) && (
<div className="flex flex-wrap gap-1.5">
{selectedTickets.flatMap(t => (t.supervisorClosures || [])
  .filter(h => !t.assignedSupervisorIds?.includes(h.supervisorUid))
  .map(h => (
    <span key={`${t.id}-${h.supervisorUid}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-500">
      {h.supervisorName || h.supervisorUid} — تم
    </span>
  )))}
</div>
)}

<div className={cn(
  'rounded-xl border px-3 py-2.5 text-xs font-bold',
  isFullNormalClosure
    ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-500'
    : 'border-amber-500/25 bg-amber-500/8 text-amber-500'
)}>
{closureModeText}
</div>
{privileged && <p className="text-[11px] text-muted-foreground">سبب الإغلاق أو الإنهاء بالنيابة مطلوب في الملاحظات.</p>}
</div>

{/* ── نوع الإغلاق ── */}
<div className="flex gap-2 mt-1">
{[
{ key: 'normal' as const, label: 'إغلاق عادي', icon: CheckCircle2, color: 'emerald' },
{ key: 'absent' as const, label: 'عدم التواجد', icon: UserX, color: 'amber' },
{ key: 'out_of_scope'as const, label: 'خارج الاختصاص', icon: Ban, color: 'red' },
 ].filter(option => !shared || option.key === 'normal').map(({ key, label, icon: Icon, color }) => (
<button
key={key}
type="button"
onClick={() => setCloseType(key)}
className={cn(
'flex-1 min-h-9 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold border transition-all',
closeType === key
? color === 'emerald' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
: color === 'amber' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
: 'bg-red-500/20 border-red-500/50 text-red-400'
: 'bg-white/5 border-border text-slate-500 hover:text-slate-300'
)}
>
<Icon className="w-3.5 h-3.5" />
{label}
</button>
))}
</div>

<div className="space-y-3 sm:space-y-6 py-2 sm:py-4">
{/* Maintenance Items Section — يظهر فقط للإغلاق العادي */}
{closeType !== 'normal' && (
<div className={cn(
'rounded-2xl border p-4 text-right text-sm leading-relaxed',
closeType === 'absent' ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
: 'bg-red-500/5 border-red-500/20 text-red-300'
)}>
{closeType === 'absent'
? '⚠️ ستُغلق التذاكر وتُرسل رسالة للعميل بطلب رفع تذكرة جديدة عند تواجده.'
: '⛔ ستُغلق التذاكر وتُرسل رسالة للعميل بأن المشكلة خارج نطاق الضمان.'}
</div>
)}
<div className="space-y-4" style={{ display: closeType === 'normal' ? 'block' : 'none' }}>
<div className="flex items-center justify-between">
<Label className="text-slate-500 block text-[10px] font-bold uppercase tracking-widest">بنود الصيانة والحالة</Label>
<Button
onClick={addMaintItem}
variant="ghost"
size="sm"
className="text-blue-400 hover:text-blue-300 gap-1 h-7"
>
<Plus className="w-3 h-3" />
إضافة بند
</Button>
</div>

<div className="space-y-2 sm:space-y-3">
{maintItems.map((item, index) => (
<div key={index} className="flex items-center gap-2 sm:gap-3 group animate-in slide-in-from-right-2">
<Button
variant="ghost"
size="icon"
className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 text-slate-500 hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
onClick={() => removeMaintItem(index)}
>
<Trash2 className="w-4 h-4" />
</Button>

<div className="flex-1 min-w-0 flex gap-2">
<DropdownMenu>
<DropdownMenuTrigger
render={<Button variant="outline" className="w-24 sm:w-32 shrink-0 justify-between border-border bg-white/5 text-white rounded-xl h-9 sm:h-10 px-2 sm:px-3 text-xs" />}
>
{item.status}
<ChevronDown className="w-3 h-3 opacity-60" />
</DropdownMenuTrigger>
<DropdownMenuContent className="bg-card border-border text-slate-200 min-w-[var(--radix-dropdown-menu-trigger-width)]" align="end">
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'تم')}>تم</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'لم يتم')}>لم يتم</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'جاري')}>جاري</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'مقاول')}>مقاول</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'خارج اختصاص')}>خارج اختصاص</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'سوء استخدام')}>سوء استخدام</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'عدم تواجد')}>عدم تواجد</DropdownMenuItem>
</DropdownMenuContent>
</DropdownMenu>

<Input
placeholder="وصف العمل المنجز"
className="min-w-0 bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-9 sm:h-10 text-right text-xs"
value={item.description}
onChange={(e) => updateItem(index, 'description', e.target.value)}
/>
</div>
</div>
))}
</div>
</div>

{/* Card Status Section */}
{closeType === 'normal' && (
<div className="space-y-2 mb-4">
<Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">حالة البطاقة</Label>
<DropdownMenu>
<DropdownMenuTrigger
render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-white rounded-xl h-10 px-3 text-xs" />}
>
{cardStatus}
<ChevronDown className="w-3 h-3 opacity-60" />
</DropdownMenuTrigger>
<DropdownMenuContent className="bg-card border-border text-slate-200 min-w-[var(--radix-dropdown-menu-trigger-width)]" align="end">
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setCardStatus('تم')}>تم</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setCardStatus('لم يتم')}>لم يتم</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setCardStatus('جاري')}>جاري</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setCardStatus('مقاول')}>مقاول</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setCardStatus('خارج اختصاص')}>خارج اختصاص</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setCardStatus('سوء استخدام')}>سوء استخدام</DropdownMenuItem>
<DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setCardStatus('عدم تواجد')}>عدم تواجد</DropdownMenuItem>
</DropdownMenuContent>
</DropdownMenu>
</div>
)}

{/* Notes Section */}
<div className="space-y-2">
<Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">ملاحظات إضافية</Label>
<textarea
className="w-full bg-white/5 border border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-2xl p-3 sm:p-4 text-right text-sm min-h-[72px] sm:min-h-[100px] outline-none transition-all"
placeholder="اكتب أي ملاحظات إضافية بخصوص العمل هنا..."
value={notes}
onChange={(e) => setNotes(e.target.value)}
/>
</div>

{/* WhatsApp Message Preview */}
<div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl overflow-hidden">
<button type="button" onClick={() => setShowMessagePreview(v => !v)} className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-[#25D366]">
<div className="flex items-center gap-2">
<MessageCircle className="w-3.5 h-3.5" />
<span className="text-[10px] font-black uppercase tracking-widest">معاينة رسالة الإغلاق</span>
</div>
<ChevronDown className={cn("w-4 h-4 transition-transform", showMessagePreview && "rotate-180")} />
</button>
{showMessagePreview && (
<p className="border-t border-emerald-500/15 px-3 py-2.5 text-right text-[11px] text-slate-400 leading-relaxed italic whitespace-pre-wrap">
"{previewMessage || 'جاري التحميل...'}"
</p>
)}
</div>
</div>

{waConnected === false && (
<div className="flex items-start gap-3 rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-right">
<AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
<div className="space-y-0.5">
<p className="text-sm font-bold text-red-400">واتساب غير مرتبط</p>
<p className="text-xs text-red-300/80 leading-relaxed">
لا يمكن إقفال التذاكر حتى يتم ربط الواتساب — يرجى الربط أولاً من الشريط أعلى الصفحة.
</p>
</div>
</div>
)}

<div className={cn(
"sticky bottom-0 z-20 -mx-4 -mb-4 mt-2 grid gap-2 border-t border-border/80 bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0",
closeType === 'normal' ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1"
)}>
{closeType === 'normal' && (
<Button type="button" variant="outline" size="sm" onClick={() => setShowSaveModal(true)} className="border-border bg-muted/30 text-slate-300 hover:text-white rounded-2xl gap-2 h-11 px-3 shrink-0">
<Download className="w-4 h-4" />
التقرير فقط
</Button>
)}
<Button onClick={handleSubmit} disabled={loading || waConnected === false || waConnected === null} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 rounded-2xl h-11 sm:h-12 font-bold shadow-md shadow-emerald-500/10 gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
<>
<Save className="w-4 h-4" />
<span className="truncate">{isFullNormalClosure ? 'تأكيد الإغلاق الكامل' : privileged ? 'تأكيد الإغلاق الجزئي' : 'إنهاء دوري'}</span>
</>
)}
</Button>
</div>
</DialogContent>
</Dialog>

{/* ── مودال اختيار صيغة التقرير ── */}
<Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
<DialogContent className="bg-card border-border text-slate-200 sm:max-w-[320px] rounded-3xl p-6" dir="rtl">
<DialogHeader>
<DialogTitle className="text-base font-bold text-white text-right flex items-center gap-2">
<Download className="w-4 h-4 text-blue-400" />
حفظ التقرير
</DialogTitle>
<p className="text-xs text-slate-400 text-right mt-1">
سيتم تحميل التقرير فقط — لن يتم إغلاق التذاكر أو إرسال أي رسائل
</p>
</DialogHeader>
<div className="flex flex-col gap-3 mt-4">
<Button
onClick={() => handleSaveReportOnly('image')}
disabled={!!savingReport}
variant="outline"
className="h-13 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 font-bold gap-3 w-full justify-center py-3"
>
{savingReport === 'image'
? <Loader2 className="w-5 h-5 animate-spin" />
: <FileImage className="w-5 h-5" />}
<div className="text-right">
<div className="text-sm font-bold">حفظ صورة</div>
<div className="text-[10px] text-blue-400/70 font-normal">تحميل كملف JPG</div>
</div>
</Button>
<Button
onClick={() => handleSaveReportOnly('pdf')}
disabled={!!savingReport}
variant="outline"
className="h-13 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 font-bold gap-3 w-full justify-center py-3"
>
{savingReport === 'pdf'
? <Loader2 className="w-5 h-5 animate-spin" />
: <FileText className="w-5 h-5" />}
<div className="text-right">
<div className="text-sm font-bold">حفظ PDF</div>
<div className="text-[10px] text-red-400/70 font-normal">تحميل كملف PDF</div>
</div>
</Button>
</div>
</DialogContent>
</Dialog>
</>
);
}

