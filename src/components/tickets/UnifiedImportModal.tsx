// src/components/tickets/UnifiedImportModal.tsx
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown, FileUp, AlertTriangle } from 'lucide-react';
import { DataImport, FieldDef } from '@/components/ui/DataImport';
import { Project, Client } from '@/types';
import { classifyTicket, TYPE_TO_SPECIALTY } from '@/services/ticketClassifier';
import { findMatchingSupervisors } from '@/services/supervisorAssignment';
import { ticketsApi } from '@/lib/api';
import { parseIssuedAt } from './TicketTable';
import { format } from 'date-fns';
import { toast } from 'sonner';

// --- Helper functions ---
const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    let [day, month, year] = parts;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateStr.split('T')[0];
};

const normalizeStatus = (status: string): string => {
  const s = (status || '').toLowerCase().trim();
  if (s === '' || s === 'مفتوح' || s === 'open') return 'open';
  if (s === 'مغلق' || s === 'closed') return 'closed';
  return 'open';
};

const normalizeVillaNumber = (raw: string): string => {
  if (!raw) return '';
  let cleaned = raw.replace(/[^0-9]/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  return cleaned || raw.trim();
};

// --- Manual Matching Modal ---
interface ManualMatchingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (matchedTickets: any[]) => void;
  unmatchedTickets: any[];
  clients: Client[];
  projects: Project[];
}

const ManualMatchingModal: React.FC<ManualMatchingModalProps> = ({ 
  isOpen, onClose, onConfirm, unmatchedTickets, clients, projects 
}) => {
  const [matchedData, setMatchedData] = useState<any[]>([]);

  React.useEffect(() => {
    if (isOpen) {
      const initialData = unmatchedTickets.map(ticket => {
        const targetProject = projects.find(p => p.abbreviation === ticket.projectPrefix) || projects[0];
        const projectClients = clients.filter(c => c.projectId === targetProject?.id);
        const autoMatchedClient = projectClients.find(c => 
          ticket.cleanVillaNumber && String(c.villaNumber) === String(ticket.cleanVillaNumber)
        );
        return {
          ...ticket,
          projectId: targetProject?.id || '',
          clientId: autoMatchedClient?.id || '',
          availableClients: projectClients
        };
      });
      setMatchedData(initialData);
    }
  }, [isOpen, unmatchedTickets, clients, projects]);

  const handleClientChange = (ticketIndex: number, clientId: string) => {
    const updated = [...matchedData];
    updated[ticketIndex].clientId = clientId;
    setMatchedData(updated);
  };

  const handleConfirm = () => {
    const stillUnmatched = matchedData.filter(t => !t.clientId);
    if (stillUnmatched.length) {
      toast.error(`ما زال هناك ${stillUnmatched.length} تذكرة بدون عميل محدد.`);
      return;
    }
    const finalTickets = matchedData.map(t => ({
      ...t,
      clientName: clients.find(c => c.id === t.clientId)?.name || 'عميل مجهول',
      villaNumber: clients.find(c => c.id === t.clientId)?.villaNumber || t.cleanVillaNumber
    }));
    onConfirm(finalTickets);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            ربط يدوي للتذاكر غير المتطابقة
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {matchedData.map((ticket, idx) => (
            <div key={idx} className="border border-red-500/30 bg-red-500/5 p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">رقم التذكرة:</span><span className="font-bold text-white mr-2">{ticket.ticketId || '—'}</span></div>
                <div><span className="text-slate-500">رقم الفيلا:</span><span className="font-bold text-white mr-2">{ticket.cleanVillaNumber || 'غير معروف'}</span></div>
                <div className="col-span-2"><span className="text-slate-500">الوصف:</span><span className="text-slate-300 mr-2 line-clamp-2">{ticket.description}</span></div>
              </div>
              <div>
                <Label className="text-slate-500 text-right text-xs">اختر العميل:</Label>
                <select 
                  className="w-full bg-white/5 border border-border rounded-xl p-2 text-right mt-1"
                  value={ticket.clientId}
                  onChange={(e) => handleClientChange(idx, e.target.value)}
                >
                  <option value="">-- اختر عميل --</option>
                  {ticket.availableClients.map((c: Client) => (
                    <option key={c.id} value={c.id}>{c.name} - فيلا {c.villaNumber}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button onClick={handleConfirm} className="bg-blue-600">تأكيد الربط ومتابعة الاستيراد</Button>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [unmatchedTickets, setUnmatchedTickets] = useState<any[]>([]);
  const [pendingMatchedTickets, setPendingMatchedTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const hasClientsInProject = selectedProjectId && clients.some(c => c.projectId === selectedProjectId);
  const projectAbbr = selectedProject?.abbreviation?.toUpperCase() || '';

  const fieldDefs: FieldDef[] = [
    { key: 'ticketId',    label: 'رقم التذكرة', aliases: ['ID', 'id', 'رقم التذكرة', 'الرقم', '#'] },
    { key: 'villaNumber', label: 'رقم الفيلا',  aliases: ['فيلا', 'villa', 'رقم الوحدة', 'الوحدة'] },
    { key: 'createdAt',   label: 'تاريخ الإنشاء', aliases: ['التاريخ', 'date', 'تاريخ التذكرة', 'تاريخ الإنشاء', 'issuedAt'] },
    { key: 'description', label: 'الوصف',        aliases: ['الوصف', 'وصف', 'description', 'المشكلة', 'تفاصيل المشكلة'] },
    { key: 'status',      label: 'الحالة',       aliases: ['الحالة', 'status', 'حالة التذكرة'] },
  ];

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

    const processed: any[] = [];
    for (let idx = 0; idx < data.length; idx++) {
      const item = data[idx];
      const ticketId = String(item.ticketId || '').trim();
      const rawVillaNumber = String(item.villaNumber || '').trim();
      const description = String(item.description || '').trim();
      const rawDate = item.createdAt ?? item.issuedAt ?? item.date ?? '';
      const rawStatus = String(item.status || '').trim();

      const cleanVillaNumber = normalizeVillaNumber(rawVillaNumber);
      const refNumber = cleanVillaNumber ? `${projectAbbr}-${cleanVillaNumber}` : '';

      const classification = classifyTicket(description);
      const finalType = classification.primaryType;

      let clientId = '';
      let clientName = '';
      if (cleanVillaNumber) {
        const matchedClient = allClientsArr.find(c => 
          normalizeVillaNumber(String(c.villaNumber)) === cleanVillaNumber
        );
        if (matchedClient) {
          clientId = matchedClient.id;
          clientName = matchedClient.name;
        }
      }

      const requiredSpecialties = [...new Set(classification.allTypes.map(t => TYPE_TO_SPECIALTY[t]))];
      const supervisors = await findMatchingSupervisors(selectedProjectId, requiredSpecialties);
      const validSupervisors = supervisors.filter(s => !s.id.startsWith('pending_'));
      const primary = validSupervisors[0] || null;
      const supervisorIds = validSupervisors.map(s => s.id);

      let issuedAtStr = '';
      if (rawDate) {
        const d = parseIssuedAt(rawDate);
        if (d) issuedAtStr = format(d, 'yyyy-MM-dd');
        else issuedAtStr = normalizeDate(rawDate);
      } else {
        issuedAtStr = new Date().toISOString().split('T')[0];
      }

      const status = normalizeStatus(rawStatus);

      processed.push({
        ticketId,
        refNumber,
        cleanVillaNumber,
        projectId: selectedProjectId,
        clientId,
        clientName,
        description,
        status,
        issuedAt: issuedAtStr,
        assigneeName: primary?.name || '',
        assignedSupervisorId: primary?.id || null,
        assignedSupervisorIds: supervisorIds,
        assignedSupervisors: validSupervisors,
        detectedTypes: classification.allTypes,
        type: finalType,
        priority: 3,
        createdAt: new Date().toISOString(),
        createdBy: currentUserId || null,
        projectPrefix: projectAbbr,
      });
    }

    const matched = processed.filter(t => t.clientId);
    const unmatched = processed.filter(t => !t.clientId);

    if (unmatched.length > 0) {
      setPendingMatchedTickets(matched);
      setUnmatchedTickets(unmatched);
      setManualModalOpen(true);
      toast.warning(`${unmatched.length} تذكرة تحتاج إلى ربط يدوي.`);
      setLoading(false);
    } else if (matched.length === 0) {
      toast.error('لا توجد تذاكر صالحة للاستيراد.');
      setLoading(false);
    } else {
      await finalizeImport(matched);
      setLoading(false);
    }
  };

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
      priority: Number(t.priority) || 3,
      issuedAt: t.issuedAt,
      createdAt: t.createdAt,
      type: t.type,
      detectedTypes: t.detectedTypes,
      assigneeName: t.assigneeName,
      assignedSupervisorId: t.assignedSupervisorId,
      assignedSupervisorIds: t.assignedSupervisorIds,
      assignedSupervisors: t.assignedSupervisors,
      createdBy: t.createdBy,
    }));

    const BATCH_SIZE = 50;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const batch = payload.slice(i, i + BATCH_SIZE);
      try {
        await ticketsApi.bulkCreate(batch);
        successCount += batch.length;
      } catch (err) {
        failCount += batch.length;
      }
      setProgress((i + batch.length) / payload.length);
    }

    if (failCount === 0) {
      toast.success(`تم استيراد ${successCount} تذكرة بنجاح`);
      setOpen(false);
      setSelectedProjectId('');
      onImportSuccess();
    } else {
      toast.error(`نجح ${successCount} تذكرة، فشل ${failCount} تذكرة.`);
    }
  };

  const handleManualConfirm = (matchedTickets: any[]) => {
    const all = [...pendingMatchedTickets, ...matchedTickets];
    finalizeImport(all);
    setManualModalOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    {/* هنا نجعل الـ DialogTrigger يتصرف كأنه Button بالتنسيق الذي تريده */}
    <Button 
      variant="outline" 
      className="border-border bg-white/5 text-slate-300 hover:text-white gap-2 rounded-xl h-11 px-5 font-bold"
    >
      {trigger}
    </Button>
  </DialogTrigger>
        
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
                <DataImport
                  title=""
                  description="الأعمدة المطلوبة: رقم التذكرة، رقم الفيلا، تاريخ الإنشاء، الوصف، الحالة (اختياري)"
                  fieldDefs={fieldDefs}
                  onImport={handleImport}
                  trigger={
                    <Button
                      type="button"
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center gap-2"
                      disabled={!selectedProjectId || !hasClientsInProject}
                    >
                      <FileUp className="w-4 h-4" />
                      رفع ملف Excel
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

      <ManualMatchingModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        onConfirm={handleManualConfirm}
        unmatchedTickets={unmatchedTickets}
        clients={clients.filter(c => c.projectId === selectedProjectId)}
        projects={projects}
      />
    </>
  );
}