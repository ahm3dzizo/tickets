// src/pages/TicketsList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { 
  AlertTriangle,
  FileUp,
  ChevronDown,
  X,
  Edit,
  MessageCircle,
  CheckSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { TicketForm } from '@/components/tickets/TicketForm';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { TicketTable, parseIssuedAt, BulkActionBar } from '@/components/tickets/TicketTable';
import { UnifiedImportModal } from '@/components/tickets/UnifiedImportModal';
import { ticketsApi, projectsApi, clientsApi } from '@/lib/api';
import { Ticket, TicketType, Project, Client } from '@/types';
import { classifyOnServer } from '@/services/classificationApi';
import { WhatsAppService } from '@/services/whatsappService';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function TicketsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const loadData = async () => {
    if (!user) return;
    try {
      const [allClients, allProjects] = await Promise.all([
        clientsApi.getAll(),
        projectsApi.getAll(),
      ]);
      const clientMap: Record<string, Client> = {};
      allClients.forEach((c: any) => { clientMap[c.id] = c as Client; });
      setClients(clientMap);
      const projectMap: Record<string, Project> = {};
      allProjects.forEach((p: any) => { projectMap[p.id] = p as Project; });
      setProjects(projectMap);

      const params: Parameters<typeof ticketsApi.getAll>[0] = {};
      if (user.role === 'supervisor') params.supervisorId = user.uid;
      else if (user.role !== 'admin' && user.projectIds?.length)
        params.projectIds = user.projectIds;
      const allTickets = await ticketsApi.getAll(params);
      setTickets(allTickets as Ticket[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Delete all tickets (dev only)
  const handleDeleteAll = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteConfirm(false);
    try {
      const result = await ticketsApi.deleteAll();
      toast.success(`تم حذف ${result.count} تذكرة بنجاح`);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('فشل حذف التذاكر');
    }
  };

  // Re-assign supervisors for tickets without any
  const [reassigning, setReassigning] = useState(false);

  const handleReassignSupervisors = async () => {
    setReassigning(true);
    try {
      const activeStatuses = new Set(['open', 'in-progress', 'pending', 'waiting']);
      const unassigned = tickets.filter(t => {
        const isActive = activeStatuses.has(String(t.status || '').toLowerCase());
        const noSupervisors = !t.assignedSupervisorIds || t.assignedSupervisorIds.length === 0;
        return isActive && noSupervisors;
      });

      if (unassigned.length === 0) {
        toast.info('لا توجد تذاكر نشطة تحتاج إعادة تعيين مشرفين');
        setReassigning(false);
        return;
      }

      const toastId = 'reassign';
      let noProjectCount = 0;
      let noSupervisorCount = 0;
      toast.loading(`⚙ جارٍ تعيين المشرفين: 0 / ${unassigned.length}`, { id: toastId, duration: Infinity });

      let done = 0;
      const updates: Promise<any>[] = [];

      for (const ticket of unassigned) {
        const projectId = ticket.projectId || '';

        if (!projectId) { done++; noProjectCount++; continue; }

        const description = ticket.description || ticket.type || 'plumbing';
        const classification = await classifyOnServer({ description, projectId });
        const supervisors = classification.supervisors;
        const primary = supervisors[0];

        if (primary) {
          updates.push(ticketsApi.update(ticket.id, {
            assigneeName:          primary.name,
            assignedSupervisorId:  primary.id,
            assignedSupervisorIds: supervisors.map((s: any) => s.id),
            assignedSupervisors:   supervisors,
            detectedTypes:         classification.allTypes,
            type:                  classification.primaryType,
          }));
        } else {
          noSupervisorCount++;
        }

        done++;
        if (done % 10 === 0) {
          toast.loading(`⚙ جارٍ تعيين المشرفين: ${done} / ${unassigned.length}`, { id: toastId, duration: Infinity });
        }
      }

      await Promise.all(updates);

      toast.success(
        `✅ تم تعيين المشرفين لـ ${updates.length} تذكرة` +
        (noProjectCount   > 0 ? ` | ${noProjectCount} بدون مشروع`  : '') +
        (noSupervisorCount > 0 ? ` | ${noSupervisorCount} بدون مشرف مطابق` : ''),
        { id: toastId, duration: 8000 }
      );
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('فشل إعادة تعيين المشرفين');
    } finally {
      setReassigning(false);
    }
  };

  // Helper for project name display
  const getProjectName = (projectId: string) => projects[projectId]?.name || '---';

  // Bulk actions
  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    try {
      await ticketsApi.bulkStatus(selectedTicketIds, newStatus);
      toast.success(`تم تحديث حالة ${selectedTicketIds.length} تذكرة`);
      setSelectedTicketIds([]);
      loadData();
    } catch {
      toast.error('فشل تحديث الحالة');
    }
  };

  const handleSendAppointment = async () => {
    const selected = tickets.filter(t => selectedTicketIds.includes(t.id));
    if (selected.length === 0) return;
    const byClient = new Map<string, typeof selected>();
    selected.forEach(t => {
      const key = t.clientId || t.villaNumber || 'unknown';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(t);
    });

    const templates = await WhatsAppService.getTemplates();

    byClient.forEach((clientTickets, key) => {
      const first = clientTickets[0];
      const phone =
        clients[first?.clientId]?.phone ??
        Object.values(clients).find(c => c.villaNumber === first?.villaNumber)?.phone ?? '';
      const ids = clientTickets.map(t => t.ticketId || t.refNumber || t.id).join('، ');
      
      const msg = WhatsAppService.processTemplate(templates.openingMsg, {
        clientName: clients[first?.clientId]?.name || '',
        ticketId: ids,
        description: first?.description || '',
        villaNumber: first?.villaNumber || '',
        date: new Date().toLocaleDateString('ar-SA'),
      });
      
      WhatsAppService.sendUpdate(phone, msg);
    });
  };

  const selectedTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
  const uniqueClientIds = new Set(selectedTickets.map(t => t.clientId || t.villaNumber || 'unknown'));
  const isMultiClient = uniqueClientIds.size > 1;

  // Split tickets based on clientId
  const unlinkedTickets = tickets.filter(t => !t.clientId);
  const linkedTickets = tickets.filter(t => !!t.clientId);

  // Sort linked tickets: closed at bottom
  const sortedLinkedTickets = [...linkedTickets].sort((a, b) => {
    const aClosed = a.status === 'closed' ? 1 : 0;
    const bClosed = b.status === 'closed' ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    const getMs = (t: Ticket) => {
      if (t.issuedAt) { const d = parseIssuedAt(t.issuedAt); if (d) return d.getTime(); }
      return new Date(t.createdAt as any).getTime() ?? 0;
    };
    return getMs(a) - getMs(b);
  });

  const distinctProjectIds = new Set(tickets.map(t => t.projectId).filter(Boolean));
  const showProjectColumn = user?.role === 'admin' || distinctProjectIds.size > 1;

  const [autoLinking, setAutoLinking] = useState(false);
  const handleAutoLink = async () => {
    setAutoLinking(true);
    try {
      const response = await fetch('/api/tickets/auto-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      toast.success(data.message);
      if (data.count > 0) loadData();
    } catch (err: any) {
      toast.error(err.message || 'فشل عملية الربط التلقائي');
    } finally {
      setAutoLinking(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-3xl font-bold text-white tracking-tight">تذاكر الصيانة</h1>
            <p className="text-slate-500 mt-1">إدارة ومتابعة طلبات الصيانة لجميع المشاريع</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Unified Import Modal */}
            {(user?.role === 'admin' || user?.role === 'engineer') && (
              <UnifiedImportModal
                trigger={
                  <Button variant="outline" className="border-border bg-white/5 text-slate-300 hover:text-white gap-2 rounded-xl h-11 px-5 font-bold">
                    <FileUp className="w-4 h-4" /> 
                    <span>استيراد تذاكر</span>
                  </Button>
                }
                projects={Object.values(projects)}
                clients={Object.values(clients)}
                onImportSuccess={loadData}
                currentUserId={user?.uid}
              />
            )}
            {/* Create ticket manually */}
            {(user?.role === 'admin' || user?.role === 'engineer') && <TicketForm onSuccess={loadData} />}
            {/* Reassign supervisors button */}
            {(user?.role === 'admin' || user?.role === 'engineer') && (
              <Button
                onClick={handleReassignSupervisors}
                disabled={reassigning}
                variant="outline"
                className="gap-2 rounded-xl h-11 border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/10 font-bold"
              >
                {reassigning
                  ? <><span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /> جارٍ التعيين...</>
                  : '⚡ إعادة تعيين المشرفين'}
              </Button>
            )}
            {/* Delete all (dev only) */}
            {import.meta.env.DEV && user?.role === 'admin' && (
              <Button
                onClick={handleDeleteAll}
                variant="outline"
                className={cn(
                  'gap-2 rounded-xl h-11 border font-bold transition-all',
                  deleteConfirm
                    ? 'border-red-500 bg-red-500/20 text-red-300 hover:bg-red-500/30 animate-pulse'
                    : 'border-red-500/30 bg-red-500/5 text-red-400 hover:border-red-500/60'
                )}
              >
                <AlertTriangle className="w-4 h-4" />
                {deleteConfirm ? 'اضغط مرة ثانية للتأكيد' : 'حذف جميع التذاكر'}
              </Button>
            )}
          </div>
        </div>

        {/* Floating bulk action bar */}
        {selectedTicketIds.length > 0 && (
          <BulkActionBar
            count={selectedTicketIds.length}
            isMultiClient={isMultiClient}
            onStatusChange={handleBulkStatusChange}
            onAppointment={handleSendAppointment}
            onClose={() => setCloseDialogOpen(true)}
            onClear={() => setSelectedTicketIds([])}
          />
        )}

        <Tabs defaultValue="linked" className="w-full">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <TabsList className="bg-white/5 border border-border h-11 p-1 rounded-xl">
              <TabsTrigger value="linked" className="rounded-lg text-sm font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                التذاكر المربوطة ({linkedTickets.length})
              </TabsTrigger>
              {unlinkedTickets.length > 0 && (
                <TabsTrigger value="unlinked" className="rounded-lg text-sm font-bold data-[state=active]:bg-red-600 data-[state=active]:text-white gap-2">
                  تذاكر غير مربوطة
                  <Badge variant="destructive" className="h-5 px-1.5 min-w-5 flex items-center justify-center text-[10px]">
                    {unlinkedTickets.length}
                  </Badge>
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="unlinked" className="mt-0">
              <Button 
                onClick={handleAutoLink} 
                disabled={autoLinking || unlinkedTickets.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 rounded-xl shadow-lg"
              >
                {autoLinking ? 'جارٍ الربط...' : 'محاولة الربط التلقائي ⚡'}
              </Button>
            </TabsContent>
          </div>

          <TabsContent value="linked" className="mt-0">
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-black/40">
              <TicketTable
                tickets={sortedLinkedTickets}
                selectedIds={selectedTicketIds}
                onSelectionChange={setSelectedTicketIds}
                hideProjectColumn={!showProjectColumn}
                projects={projects}
                showInlineFilters
              />
            </div>
          </TabsContent>

          <TabsContent value="unlinked" className="mt-0">
            <div className="bg-card border border-red-500/30 rounded-3xl overflow-hidden shadow-2xl shadow-black/40">
              <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-400 font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                هذه التذاكر لا تحتوي على بيانات العميل أو أن الفيلا المكتوبة غير مسجلة في قائمة عملاء المشروع
              </div>
              <TicketTable
                tickets={unlinkedTickets}
                selectedIds={selectedTicketIds}
                onSelectionChange={setSelectedTicketIds}
                hideProjectColumn={!showProjectColumn}
                projects={projects}
                showInlineFilters
              />
            </div>
          </TabsContent>
        </Tabs>

        <CloseTicketDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          selectedTickets={tickets.filter(t => selectedTicketIds.includes(t.id))}
          clients={Object.values(clients)}
          projects={projects}
          onSuccess={() => { setSelectedTicketIds([]); setCloseDialogOpen(false); loadData(); }}
        />
      </div>
    </Layout>
  );
}