import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  AlertCircle,
  Tag,
  User,
  Calendar as CalendarIcon,
  Briefcase,
  Home
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { collection, onSnapshot, query, addDoc, serverTimestamp, collectionGroup, where, Query, DocumentData, getDocs } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { Project, Client, TicketType } from '@/types';
import { classifyTicket, TYPE_TO_SPECIALTY } from '@/services/ticketClassifier';
import { findMatchingSupervisors } from '@/services/supervisorAssignment';
import { NotificationService } from '@/services/notificationService';
import { useAuth } from '@/contexts/AuthContext';
import { DataImport } from '@/components/ui/DataImport';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TicketFormProps {
  trigger?: React.ReactNode;
  nativeButton?: boolean;
  projectId?: string;
}

export function TicketForm({ trigger, nativeButton, projectId: defaultProjectId }: TicketFormProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ticketId, setTicketId] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [clientId, setClientId] = useState('');
  const [villaNumber, setVillaNumber] = useState('');
  const [description, setDescription] = useState('');
  const [types, setTypes] = useState<TicketType[]>(['electricity']);
  const [priority, setPriority] = useState<string | number>('3');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const isCustomTrigger = !!trigger;

  useEffect(() => {
    const db = getFirestoreDb();
    let q: Query<DocumentData> = query(collection(db, 'projects'));
    
    if (user && user.role !== 'admin' && user.projectIds && user.projectIds.length > 0) {
      q = query(collection(db, 'projects'), where('__name__', 'in', user.projectIds));
    }

    return onSnapshot(q, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    });
  }, [user]);

  useEffect(() => {
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
    }
  }, [defaultProjectId]);

  useEffect(() => {
    if (!projectId) {
      setClients([]);
      return;
    }
    const db = getFirestoreDb();
    const q = query(collection(db, `projects/${projectId}/clients`));
    return onSnapshot(q, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    });
  }, [projectId]);

  // Auto-classify description → suggest types
  useEffect(() => {
    if (!description || description.length < 6) return;
    const result = classifyTicket(description);
    if (result.confidence > 0) setTypes(result.allTypes);
  }, [description]);

  // Auto-generate refNumber
  useEffect(() => {
    if (projectId && villaNumber) {
      const selectedProject = projects.find(p => p.id === projectId);
      if (selectedProject) {
        setRefNumber(`${selectedProject.abbreviation}-${villaNumber}`);
      }
    }
  }, [projectId, villaNumber, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !description) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    setLoading(true);

    try {
      const db = getFirestoreDb();
      const currentClient = clients.find(c => c.id === clientId);
      // Auto-assign supervisors based on detected specialties
      const requiredSpecialties = [...new Set(types.map(t => TYPE_TO_SPECIALTY[t]))] as any[];
      const supervisors = projectId ? await findMatchingSupervisors(projectId, requiredSpecialties) : [];
      const ticketDocRef = await addDoc(collection(db, 'tickets'), {
        ticketId,
        refNumber,
        assigneeName: assigneeName || (supervisors[0]?.name ?? ''),
        projectId,
        clientId,
        clientName: currentClient?.name || '',
        villaNumber,
        description,
        type: types[0],
        detectedTypes: types,
        assignedSupervisorId:  supervisors[0]?.id ?? '',
        assignedSupervisorIds: supervisors.map(s => s.id),
        assignedSupervisors:   supervisors,
        status: 'open',
        priority: Number(priority),
        createdAt: serverTimestamp(),
        createdBy: user?.uid
      });
      // Notify each assigned supervisor
      if (supervisors.length > 0) {
        NotificationService.writeAssignmentNotifications(
          supervisors,
          ticketDocRef.id,
          refNumber,
          villaNumber,
          description
        ).catch(console.warn);
      }
      toast.success('تم إنشاء التذكرة بنجاح');
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error('فشل إنشاء التذكرة');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTicketId('');
    setRefNumber('');
    setAssigneeName('');
    setProjectId(defaultProjectId || '');
    setClientId('');
    setVillaNumber('');
    setDescription('');
    setTypes(['electricity']);
    setPriority('3');
  };

  const handleImportTickets = async (data: any[]) => {
    const db = getFirestoreDb();
    setLoading(true);
    
    try {
      // 1. Fetch all clients across all projects to build a lookup map
      const clientsSnapshot = await getDocs(query(collectionGroup(db, 'clients')));
      const allClients = clientsSnapshot.docs.map(doc => ({
        id: doc.id,
        projectId: doc.ref.parent.parent?.id,
        ...doc.data()
      } as any));

      const batch = data.map(item => {
        // Helper to get value from multiple possible keys (Named or Positional)
        const getValue = (keys: string[], index?: number): string => {
          // 1. Try named keys first
          for (const key of keys) {
            if (item[key] !== undefined && item[key] !== null) return String(item[key]).trim();
          }
          // 2. Fallback to Positional keys based on user screenshot pattern: EMPTY_N__
          if (index !== undefined) {
            // Pattern from screenshot: EMPTY__, EMPTY_1__, EMPTY_2__
            const patterns = [
              index === 0 ? 'EMPTY__' : `EMPTY_${index}__`,
              index === 0 ? '__EMPTY' : `__EMPTY_${index}`,
              index === 0 ? 'EMPTY' : `EMPTY_${index}`
            ];
            for (const p of patterns) {
              if (item[p] !== undefined) return String(item[p]).trim();
            }
            // Last resort: find by object keys order
            const objKeys = Object.keys(item);
            if (objKeys[index] !== undefined) return String(item[objKeys[index]]).trim();
          }
          return '';
        };

        const rawTicketId = getValue(['ID', 'ticketId'], 0);
        const rawRef = getValue(['المرجع', 'refNumber', 'المرجع '], 1);
        const rawClientName = getValue(['العميل', 'clientName', 'العميل '], 2);
        const rawVilla = getValue(['رقم الفيلا', 'villaNumber', 'رقم الفيلا '], 3); 
        const itemDescription = getValue(['الوصف', 'description', 'الوصف '], 4);
        const itemPriority = getValue(['الأولوية', 'priority', 'ف'], 5);
        const rawAssignee = getValue(['المسؤول', 'assigneeName', 'المسؤول '], 6);

        const projectName = item['المشروع'] || item.projectName || '';
        const targetProject = projects.find(p => p.name === projectName) || 
                             projects.find(p => p.id === projectId) ||
                             projects.find(p => p.abbreviation === item['المشروع']) ||
                             projects[0];
        
        // Extract villa number from Reference if it looks like "NTF-296"
        let extractedVilla = rawVilla;
        if (!extractedVilla && rawRef.includes('-')) {
          const parts = rawRef.split('-');
          const lastPart = parts[parts.length - 1];
          if (!isNaN(Number(lastPart))) {
            extractedVilla = lastPart;
          }
        }

        const typeMap: Record<string, string> = {
          'كهرباء': 'electricity', 'سباكة': 'plumbing', 'أبواب': 'doors',
          'دهانات': 'paints', 'تشققات': 'cracks', 'سيراميك': 'ceramics', 'عزل خزان': 'tank_insulation'
        };
        
        const rawType = item['النوع'] || item.type || '';
        const mappedType = typeMap[rawType] || rawType || 'electricity';
        
        // Robust Client Matching:
        // 1. By Villa Number (extracted or rawValue)
        // 2. By Client Name
        const matchedClient = allClients.find(c => 
          c.projectId === targetProject?.id && (
            (extractedVilla && String(c.villaNumber) === String(extractedVilla)) ||
            (rawClientName && c.name.includes(rawClientName)) ||
            (rawClientName && rawClientName.includes(c.name))
          )
        );

        let finalRef = rawRef;
        if (!finalRef && targetProject && extractedVilla) {
          finalRef = `${targetProject.abbreviation}-${extractedVilla}`;
        }

        return addDoc(collection(db, 'tickets'), {
          ticketId: rawTicketId,
          refNumber: finalRef || '---',
          assigneeName: rawAssignee,
          projectId: targetProject?.id || '',
          clientId: matchedClient?.id || '',
          clientName: matchedClient?.name || rawClientName || 'عميل مجهول',
          villaNumber: extractedVilla || matchedClient?.villaNumber || '',
          description: itemDescription || 'لا يوجد وصف',
          type: mappedType,
          status: 'open',
          priority: Number(itemPriority || 3),
          createdAt: serverTimestamp(),
          createdBy: user?.uid
        });
      });

      await Promise.all(batch);
      toast.success(`تم استيراد ${data.length} تذكرة بنجاح`);
      setOpen(false);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('حدث خطأ أثناء الاستيراد');
    } finally {
      setLoading(false);
    }
  };

  const typeTranslations: Record<TicketType, string> = {
    'electricity': 'كهرباء',
    'plumbing': 'سباكة',
    'doors': 'أبواب',
    'paints': 'دهانات',
    'cracks': 'تشققات',
    'ceramics': 'سيراميك',
    'tank_insulation': 'عزل خزان',
  };

  const priorityTranslations: Record<string, string> = {
    '3': '3 - منخفض',
    '4': '4 - عادي',
    '6': '6 - متوسط',
    '7': '7 - مرتفع',
    '9': '9 - عاجل جداً',
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        nativeButton={nativeButton ?? true}
        render={React.isValidElement(trigger) ? trigger : (
          <Button className="bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white gap-2 rounded-full px-6 h-11 shadow-lg shadow-blue-500/20 font-bold">
            {trigger || (
              <>
                <Plus className="w-4 h-4" />
                تذكرة جديدة
              </>
            )}
          </Button>
        )} 
      />
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[600px] rounded-2xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-white text-right">إنشاء تذكرة صيانة</DialogTitle>
            <DataImport 
              title="استيراد تذاكر"
              description="ارفع ملف Excel يحتوي على بيانات التذاكر"
              fieldDefs={[
                { key: 'ticketId',     label: 'ID',            aliases: ['ID', 'id', 'رقم التذكرة', 'الرقم'] },
                { key: 'refNumber',    label: 'المرجع',        aliases: ['المرجع', 'ref', 'reference', 'رقم المرجع'] },
                { key: 'assigneeName', label: 'المسؤول',       aliases: ['المسؤول', 'المنفذ', 'assignee', 'الفني'] },
                { key: 'clientName',   label: 'العميل',        aliases: ['العميل', 'اسم العميل', 'client', 'المالك'] },
                { key: 'villaNumber',  label: 'رقم الفيلا',    aliases: ['رقم الفيلا', 'الفيلا', 'فيلا', 'villa'] },
                { key: 'description',  label: 'الوصف',         aliases: ['الوصف', 'وصف', 'description', 'المشكلة'] },
                { key: 'projectName',  label: 'المشروع',       aliases: ['المشروع', 'project', 'اسم المشروع'] },
                { key: 'ticketType',   label: 'نوع الصيانة',   aliases: ['النوع', 'نوع', 'type', 'الصيانة', 'التصنيف'] },
              ]}
              onImport={handleImportTickets}
            />
          </div>
          <DialogDescription className="text-slate-500 text-right">
            أدخل بيانات المشروع والعميل ووصف المشكلة.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">ID</Label>
              <Input 
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="182787"
                className="bg-white/5 border-border text-slate-300 rounded-xl h-12 text-right"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المرجع</Label>
              <Input 
                value={refNumber}
                onChange={(e) => setRefNumber(e.target.value)}
                placeholder="NTF-685"
                className="bg-white/5 border-border text-slate-300 rounded-xl h-12 text-right"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المسؤول</Label>
              <Input 
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="أحمد"
                className="bg-white/5 border-border text-slate-300 rounded-xl h-12 text-right"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المشروع</Label>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                  <Briefcase className="w-3 h-3 opacity-50" />
                  <span>{projects.find(p => p.id === projectId)?.name || 'اختر المشروع'}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                  {projects.map((p) => (
                    <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setProjectId(p.id)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">العميل / الفيلا</Label>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" disabled={!projectId} />}>
                  <Home className="w-3 h-3 opacity-50" />
                  <span>{clients.find(c => c.id === clientId)?.name ? `${clients.find(c => c.id === clientId)?.name} - ${clients.find(c => c.id === clientId)?.villaNumber}` : 'اختر العميل'}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                  {clients.map((c) => (
                    <DropdownMenuItem key={c.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => { setClientId(c.id); setVillaNumber(c.villaNumber); }}>
                      {c.name} - {c.villaNumber}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              نوع التذكرة <span className="text-slate-600 normal-case">(اختر واحداً أو أكثر — يُكتشف تلقائياً من الوصف)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(typeTranslations) as TicketType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTypes(prev =>
                    prev.includes(t)
                      ? (prev.length > 1 ? prev.filter(x => x !== t) : prev)
                      : [...prev, t]
                  )}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                    types.includes(t)
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
                  )}
                >
                  {typeTranslations[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الأولوية</Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                <AlertCircle className="w-3 h-3 opacity-50" />
                <span>{priorityTranslations[priority]}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                {['3', '4', '6', '7', '9'].map((p) => (
                  <DropdownMenuItem key={p} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setPriority(p)}>
                    {priorityTranslations[p]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description" className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">وصف المشكلة</Label>
            <textarea 
              id="description"
              className="w-full min-h-[120px] bg-white/5 border border-border rounded-xl p-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-right"
              placeholder="صف المشكلة بالتفصيل..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="pt-4 gap-3">
            <Button type="submit" className="bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white px-8 rounded-full h-11 font-bold shadow-lg shadow-blue-500/20">
              إنشاء التذكرة
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              className="text-slate-500 hover:text-white rounded-full"
              onClick={() => setOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
