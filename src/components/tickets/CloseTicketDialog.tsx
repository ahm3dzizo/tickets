import React, { useState } from 'react';
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
  FolderOpen,
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ticket, Client, Project } from '@/types';
import { ticketsApi, projectsApi, whatsappApi } from '@/lib/api';
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
  type CloseType = 'normal' | 'absent' | 'out_of_scope';
  const [closeType, setCloseType] = useState<CloseType>('normal');
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [notes, setNotes] = useState('');
  const [maintItems, setMaintItems] = useState<{ description: string; status: string }[]>(
    selectedTickets.map(t => ({ description: t.description, status: 'تم' }))
  );
  const [savedDirName, setSavedDirName] = useState<string | null>(null);

  // Load saved dir name on mount
  React.useEffect(() => {
    getSavedDirHandle().then(h => setSavedDirName(h?.name ?? null));
  }, []);

  const [closingMsgTemplate, setClosingMsgTemplate]     = useState('');
  const [absentMsgTemplate, setAbsentMsgTemplate]       = useState('');
  const [outOfScopeMsgTemplate, setOutOfScopeMsgTemplate] = useState('');

  React.useEffect(() => {
    if (open) {
      setCloseType('normal');
      WhatsAppService.getTemplates().then(t => {
        setClosingMsgTemplate(t.closingMsg);
        setAbsentMsgTemplate(t.absentMsg || '');
        setOutOfScopeMsgTemplate(t.outOfScopeMsg || '');
      });
    }
  }, [open]);

  const currentVilla = selectedTickets[0]?.villaNumber;
  const targetClient = clients.find(c => c.villaNumber === currentVilla);
  const mainTicket = selectedTickets[0];
  const waIds = selectedTickets.map(t => t.ticketId || t.refNumber).join('، ');

  const msgParams = {
    clientName:   targetClient?.name || mainTicket?.clientName || '',
    ticketId:     waIds,
    description:  mainTicket?.description || '',
    villaNumber:  targetClient?.villaNumber || mainTicket?.villaNumber || '',
    closureNotes: notes || 'تم الإنجاز',
    date:         new Date().toLocaleDateString('ar-SA'),
  };
  const previewMessage =
    closeType === 'absent'       ? WhatsAppService.processTemplate(absentMsgTemplate, msgParams) :
    closeType === 'out_of_scope' ? WhatsAppService.processTemplate(outOfScopeMsgTemplate, msgParams) :
    WhatsAppService.processTemplate(closingMsgTemplate, msgParams);

  // Sync items if selectedTickets changes
  React.useEffect(() => {
    setMaintItems(selectedTickets.map(t => ({ description: t.description, status: 'تم' })));
  }, [selectedTickets]);

  const handlePickFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      toast.error('المتصفح لا يدعم اختيار المجلد — استخدم Chrome أو Edge');
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
      await saveDirHandle(handle);
      setSavedDirName(handle.name);
      toast.success(`تم تعيين مجلد الحفظ: ${handle.name}`);
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('تعذّر اختيار المجلد');
    }
  };

  const handleClearFolder = async () => {
    await clearDirHandle();
    setSavedDirName(null);
    toast.info('تم إزالة مجلد الحفظ');
  };

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

  const handleSpecialClose = async () => {
    if (closeType === 'normal') return;
    setLoading(true);
    try {
      const isWhatsAppSent = targetClient?.phone && previewMessage;
      
      // إرسال رسالة الواتساب المجمعة أولاً
      if (isWhatsAppSent) {
        try {
          await whatsappApi.send(targetClient.phone, previewMessage);
        } catch (e: any) {
          toast.error(`تعذر إرسال رسالة الواتساب: ${e.message || 'خطأ غير معروف'}`);
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
    if (closeType !== 'normal') { handleSpecialClose(); return; }

    if (maintItems.length === 0) {
      toast.error('يرجى إضافة بند صيانة واحد على الأقل');
      return;
    }

    setLoading(true);
    setCopying(true);

    try {
      // 1. Build report data and call Python backend

      // Resolve project name: use prop if available, otherwise fetch via API
      let projectName = staticProjectName;
      if (!projectName && mainTicket?.projectId) {
        try {
          const project = await projectsApi.get(mainTicket.projectId);
          if (project) projectName = (project as Project).name;
        } catch { /* silently ignore */ }
      }
      const priorityMap: Record<string, string> = {
        low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة جداً',
        '3': 'منخفضة', '4': 'عادية', '6': 'متوسطة', '7': 'عالية', '9': 'عاجلة جداً',
      };
      const priorityLabel = mainTicket?.priority
        ? (priorityMap[String(mainTicket.priority)] || String(mainTicket.priority))
        : 'الأولوية';

      const reportPayload = {
        ticket_num: selectedTickets.map(t => t.ticketId || t.refNumber).join('، '),
        villa: mainTicket?.villaNumber || '',
        customer_name: targetClient?.name || mainTicket?.clientName || '',
        phone: targetClient?.phone || '',
        maint_items: maintItems.map(item => [item.description, item.status]),
        notes,
        block: targetClient?.blockNumber || '',
        project: projectName || '',
        ticket_date: mainTicket?.issuedAt || '',
        priority: priorityLabel,
        nhc: mainTicket?.projectAbbr || mainTicket?.refNumber?.split('-')[0] || '',
      };

      const authToken = localStorage.getItem('retal_auth_token');
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          ...reportPayload,
          // Passed to backend for WhatsApp image sending (stripped before Python)
          whatsappPhone: targetClient?.phone || '',
          whatsappMessage: previewMessage,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Report generation error:', err);
        toast.error('فشل إنشاء صورة التقرير — لم يتم إغلاق التذاكر');
        return;
      }

      const blob = await response.blob();

      const firstTicketNo = selectedTickets[0]?.ticketId || selectedTickets[0]?.refNumber || 'ticket';
      const fileName = `${mainTicket?.villaNumber || 'villa'}-${firstTicketNo}.jpg`;
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
          setSavedDirName(null);
        }
      }

      // 2. Close tickets via API — only after successful save
      await Promise.all(selectedTickets.map(ticket =>
        ticketsApi.update(ticket.id, {
          status: 'closed',
          closedAt: new Date().toISOString(),
          closureNotes: notes,
          maintenanceItems: maintItems
        })
      ));

      // 3. The Backend already sends the WhatsApp message + Image via Baileys API silently!
      // (We passed whatsappPhone in the /api/generate-report payload)

      // الـ backend يبعت التقرير + طلب الموافقة تلقائيًا بعد 3 ثوانٍ

      const isWhatsAppSent = targetClient?.phone && previewMessage;
      toast.success(`تم إغلاق التذاكر بنجاح${isWhatsAppSent ? ' — جارٍ إرسال التقرير وطلب الموافقة 💬' : ''}`);
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
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[700px] rounded-3xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2 justify-start">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-white text-right">إقفال التذاكر المختارة</DialogTitle>
          </div>
          <div className="text-right p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">فيلا رقم {currentVilla}</div>
            <div className="text-sm font-bold text-blue-400">
              {selectedTickets.map(t => `#${t.ticketId || t.refNumber}`).join(' ، ')}
            </div>
          </div>
        </DialogHeader>

        {/* ── نوع الإغلاق ── */}
        <div className="flex gap-2 mt-1">
          {[
            { key: 'normal'      as const, label: 'إغلاق عادي',      icon: CheckCircle2, color: 'emerald' },
            { key: 'absent'      as const, label: 'عدم التواجد',      icon: UserX,        color: 'amber'   },
            { key: 'out_of_scope'as const, label: 'خارج الاختصاص',  icon: Ban,          color: 'red'     },
          ].map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setCloseType(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition-all',
                closeType === key
                  ? color === 'emerald' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : color === 'amber'   ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'bg-red-500/20 border-red-500/50 text-red-400'
                  : 'bg-white/5 border-border text-slate-500 hover:text-slate-300'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-6 py-4">
          {/* Maintenance Items Section — يظهر فقط للإغلاق العادي */}
          {closeType !== 'normal' && (
            <div className={cn(
              'rounded-2xl border p-4 text-right text-sm leading-relaxed',
              closeType === 'absent'       ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
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
            
            <div className="space-y-3">
              {maintItems.map((item, index) => (
                <div key={index} className="flex items-center gap-3 group animate-in slide-in-from-right-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeMaintItem(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  
                  <div className="flex-1 flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="outline" className="w-32 justify-between border-border bg-white/5 text-white rounded-xl h-10 px-3 text-xs" />}
                      >
                        {item.status}
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-card border-border text-slate-200 min-w-[var(--radix-dropdown-menu-trigger-width)]" align="end">
                        <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'تم')}>تم</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'لم يتم')}>لم يتم</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'جاري العمل')}>جاري</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => updateItem(index, 'status', 'مرفوض')}>مرفوض</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    <Input 
                      placeholder="وصف العمل المنجز" 
                      className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-10 text-right text-xs"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes Section */}
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">ملاحظات إضافية</Label>
            <textarea 
              className="w-full bg-white/5 border border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-2xl p-4 text-right text-sm min-h-[100px] outline-none transition-all"
              placeholder="اكتب أي ملاحظات إضافية بخصوص العمل هنا..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* WhatsApp Message Preview */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 justify-start text-[#25D366] mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest">معاينة رسالة الإغلاق</span>
              <MessageCircle className="w-3.5 h-3.5" />
            </div>
            <p className="text-right text-[11px] text-slate-400 leading-relaxed italic whitespace-pre-wrap">
              "{previewMessage || 'جاري التحميل...'}"
            </p>
          </div>
        </div>

        <DialogFooter className="gap-3 pt-4 border-t border-white/5 flex-col sm:flex-row">
          {/* Folder picker — only show on browsers that support it */}
          {'showDirectoryPicker' in window && !isMobileDevice && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePickFolder}
                className="border-slate-600 text-slate-300 hover:text-white rounded-xl gap-2 h-10 px-3 shrink-0"
              >
                <FolderOpen className="w-4 h-4" />
                {savedDirName ? savedDirName : 'تعيين مجلد الحفظ'}
              </Button>
              {savedDirName && (
                <button
                  type="button"
                  onClick={handleClearFolder}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                  title="إزالة المجلد"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <Button 
            onClick={handleSubmit} 
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 rounded-xl h-12 font-bold shadow-lg shadow-emerald-500/20 flex-1 gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>
                <Save className="w-4 h-4" />
                قفل وحفظ التقرير
              </>
            )}
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="text-slate-500 hover:text-white rounded-xl h-12"
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
