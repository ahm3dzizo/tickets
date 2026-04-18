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
  FolderOpen
} from 'lucide-react';
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
import { doc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

  const currentVilla = selectedTickets[0]?.villaNumber;
  const targetClient = clients.find(c => c.villaNumber === currentVilla);
  // projectName resolved at submit time via getDoc fallback (avoids collection-list permission issues)
  const staticProjectName = selectedTickets[0]?.projectId
    ? projects?.[selectedTickets[0].projectId]?.name
    : undefined;

  const handleSubmit = async () => {
    if (maintItems.length === 0) {
      toast.error('يرجى إضافة بند صيانة واحد على الأقل');
      return;
    }

    setLoading(true);
    setCopying(true);

    try {
      // 1. Build report data and call Python backend
      const mainTicket = selectedTickets[0];

      // Resolve project name: use prop if available, otherwise fetch the single doc directly
      let projectName = staticProjectName;
      if (!projectName && mainTicket?.projectId) {
        try {
          const db = getFirestoreDb();
          const snap = await getDoc(doc(db, 'projects', mainTicket.projectId));
          if (snap.exists()) projectName = (snap.data() as Project).name;
        } catch { /* silently ignore — user might lack access */ }
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

      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Report generation error:', err);
        toast.error('فشل إنشاء صورة التقرير — لم يتم إغلاق التذاكر');
        return;
      }

      const blob = await response.blob();

      const ticketIdsList = selectedTickets.map(t => t.ticketId || t.refNumber).join('-');
      const fileName = `بلاغ-${ticketIdsList}-${new Date().toISOString().slice(0,10)}.jpg`;
      let saved = false;

      // 1st priority: pre-selected directory handle
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
            saved = true;
          } else {
            await clearDirHandle();
            setSavedDirName(null);
            toast.error('تم رفض إذن الوصول للمجلد — لم يتم إغلاق التذاكر');
            return;
          }
        } catch (dirErr: any) {
          console.warn('Dir handle failed:', dirErr);
          await clearDirHandle();
          setSavedDirName(null);
          toast.error('فشل الوصول للمجلد المحدد — يرجى إعادة تعيين المجلد');
          return;
        }
      }

      // 2nd priority: showSaveFilePicker (desktop Chrome/Edge)
      if (!saved && 'showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'JPEG Image', accept: { 'image/jpeg': ['.jpg'] } }],
            startIn: 'downloads',
          });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast.success(`تم حفظ التقرير: ${fileName}`);
          saved = true;
        } catch (fsErr: any) {
          if (fsErr?.name === 'AbortError') {
            // User cancelled — block closing
            toast.warning('تم إلغاء الحفظ — لم يتم إغلاق التذاكر');
            return;
          }
          // Other error — fallback to download
          downloadBlob(blob, fileName);
          toast.success(`تم تنزيل التقرير إلى مجلد التنزيلات`);
          saved = true;
        }
      }

      // Fallback: auto-download (mobile / Firefox)
      if (!saved) {
        downloadBlob(blob, fileName);
        toast.success(`تم تنزيل التقرير إلى مجلد التنزيلات`);
      }

      // 2. Close tickets in Firestore — only after successful save
      const db = getFirestoreDb();
      const batch = writeBatch(db);
      selectedTickets.forEach(ticket => {
        batch.update(doc(db, 'tickets', ticket.id), {
          status: 'closed',
          closedAt: serverTimestamp(),
          closureNotes: notes,
          maintenanceItems: maintItems
        });
      });
      await batch.commit();

      // 3. Open WhatsApp
      if (targetClient?.phone) {
        const waIds = selectedTickets.map(t => t.ticketId || t.refNumber).join('، ');
        const message = `السلام عليكم، بخصوص بلاغ الصيانة رقم ${waIds}، تم الانتهاء من الصيانة المطلوبة بنجاح. نرجو التفضل بالتوقيع على نموذج الإغلاق. شكراً لتعاونكم.`;
        const phone = targetClient.phone.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
      }

      toast.success('تم إغلاق التذاكر بنجاح');
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
          <div className="flex items-center gap-3 mb-2 justify-end">
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

        <div className="space-y-6 py-4">
          {/* Maintenance Items Section */}
          <div className="space-y-4">
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
                    <select 
                      className="bg-white/5 border-border rounded-xl px-3 text-xs text-white focus:ring-1 focus:ring-blue-500/30 outline-none w-32 h-10 text-right appearance-none"
                      value={item.status}
                      onChange={(e) => updateItem(index, 'status', e.target.value)}
                    >
                      <option value="تم" className="bg-slate-900">تم</option>
                      <option value="لم يتم" className="bg-slate-900">لم يتم</option>
                      <option value="جاري العمل" className="bg-slate-900">جاري</option>
                      <option value="مرفوض" className="bg-slate-900">مرفوض</option>
                    </select>
                    
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
            <div className="flex items-center gap-2 justify-end text-[#25D366] mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest">معاينة رسالة الإغلاق</span>
              <MessageCircle className="w-3.5 h-3.5" />
            </div>
            <p className="text-right text-[11px] text-slate-400 leading-relaxed italic">
              "السلام عليكم، بخصوص بلاغ الصيانة رقم {selectedTickets.map(t => t.ticketId || t.refNumber).join('، ')}، تم الانتهاء من الصيانة المطلوبة بنجاح. نرجو التفضل بالتوقيع على نموذج الإغلاق. شكراً لتعاونكم."
            </p>
          </div>
        </div>

        <DialogFooter className="gap-3 pt-4 border-t border-white/5 flex-col sm:flex-row">
          {/* Folder picker — only show on browsers that support it */}
          {'showDirectoryPicker' in window && (
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
