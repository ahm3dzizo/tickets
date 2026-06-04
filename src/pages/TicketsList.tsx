// src/pages/TicketsList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertTriangle, FileUp, User, UserPlus, HelpCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TicketForm } from '@/components/tickets/TicketForm';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { TicketTable, parseIssuedAt, BulkActionBar } from '@/components/tickets/TicketTable';
import { UnifiedImportModal } from '@/components/tickets/UnifiedImportModal';
import { AppointmentDialog } from '@/components/tickets/AppointmentDialog';
import { ClientForm } from '@/components/clients/ClientForm';
import { ticketsApi, projectsApi, clientsApi } from '@/lib/api';
import { Ticket, Project, Client } from '@/types';
import { classifyOnServer } from '@/services/classificationApi';
import { WhatsAppService } from '@/services/whatsappService';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function TicketsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [projects, setProjects]     = useState<Record<string, Project>>({});
  const [clients, setClients]       = useState<Record<string, Client>>({});
  const [loading, setLoading]       = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [apptTicket, setApptTicket] = useState<Ticket[] | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);

  const loadData = async () => {
    if (!user) return;
    try {
      const [allClients, allProjects] = await Promise.all([clientsApi.getAll(), projectsApi.getAll()]);
      const clientMap: Record<string, Client> = {};
      allClients.forEach((c: any) => { clientMap[c.id] = c as Client; });
      setClients(clientMap);
      const projectMap: Record<string, Project> = {};
      allProjects.forEach((p: any) => { projectMap[p.id] = p as Project; });
      setProjects(projectMap);

      const params: Parameters<typeof ticketsApi.getAll>[0] = {};
      if (user.role === 'supervisor') params.supervisorId = user.uid;
      else if (user.role !== 'admin' && user.projectIds?.length) params.projectIds = user.projectIds;
      const allTickets = await ticketsApi.getAll(params);
      setTickets(allTickets as Ticket[]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [user]);

  const handleDeleteAll = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteConfirm(false);
    try {
      const result = await ticketsApi.deleteAll();
      toast.success(`تم حذف ${result.count} تذكرة`);
      loadData();
    } catch { toast.error('فشل حذف التذاكر'); }
  };

  const handleReassignSupervisors = async () => {
    setReassigning(true);
    try {
      const activeStatuses = new Set(['open', 'in-progress', 'pending', 'waiting']);
      const unassigned = tickets.filter(t =>
        activeStatuses.has(String(t.status || '').toLowerCase()) &&
        (!t.assignedSupervisorIds || t.assignedSupervisorIds.length === 0)
      );
      if (unassigned.length === 0) { toast.info('لا توجد تذاكر تحتاج إعادة تعيين'); setReassigning(false); return; }

      const toastId = 'reassign';
      let noProjectCount = 0, noSupervisorCount = 0;
      toast.loading(`⚙ جارٍ تعيين المشرفين: 0 / ${unassigned.length}`, { id: toastId, duration: Infinity });

      let done = 0;
      const updates: Promise<any>[] = [];
      for (const ticket of unassigned) {
        const projectId = ticket.projectId || '';
        if (!projectId) { done++; noProjectCount++; continue; }
        const classification = await classifyOnServer({ description: ticket.description || ticket.type || 'plumbing', projectId });
        const supervisors = classification.supervisors;
        const primary = supervisors[0];
        if (primary) {
          updates.push(ticketsApi.update(ticket.id, {
            assigneeName: primary.name, assignedSupervisorId: primary.id,
            assignedSupervisorIds: supervisors.map((s: any) => s.id),
            assignedSupervisors: supervisors, detectedTypes: classification.allTypes, type: classification.primaryType,
          }));
        } else { noSupervisorCount++; }
        done++;
        if (done % 10 === 0) toast.loading(`⚙ جارٍ تعيين المشرفين: ${done} / ${unassigned.length}`, { id: toastId, duration: Infinity });
      }

      await Promise.all(updates);
      toast.success(
        `تم تعيين المشرفين لـ ${updates.length} تذكرة` +
        (noProjectCount > 0 ? ` | ${noProjectCount} بدون مشروع` : '') +
        (noSupervisorCount > 0 ? ` | ${noSupervisorCount} بدون مشرف مطابق` : ''),
        { id: toastId, duration: 8000 }
      );
      loadData();
    } catch { toast.error('فشل إعادة تعيين المشرفين'); }
    finally { setReassigning(false); }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    try {
      await ticketsApi.bulkStatus(selectedTicketIds, newStatus);
      toast.success(`تم تحديث ${selectedTicketIds.length} تذكرة`);
      setSelectedTicketIds([]); loadData();
    } catch { toast.error('فشل تحديث الحالة'); }
  };

  const handleSendAppointment = () => {
    const selected = tickets.filter(t => selectedTicketIds.includes(t.id));
    if (selected.length === 0) return;
    setApptTicket(selected); // We'll update the state type
    setApptOpen(true);
  };

  const handleAutoLink = async () => {
    setAutoLinking(true);
    try {
      const response = await fetch('/api/tickets/auto-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.success(data.message);
      if (data.count > 0) loadData();
    } catch (err: any) { toast.error(err.message || 'فشل عملية الربط التلقائي'); }
    finally { setAutoLinking(false); }
  };

  const unlinkedTickets      = tickets.filter(t => !t.clientId);
  const linkedTickets        = tickets.filter(t => !!t.clientId);
  // Unclassified = no type OR explicitly "unclassified" (new fallback)
  const unclassifiedTickets  = tickets.filter(t => !t.type || t.type === 'unclassified');

  const [bulkClassifying, setBulkClassifying] = useState(false);

  const handleBulkReclassify = async () => {
    if (unclassifiedTickets.length === 0) return;
    setBulkClassifying(true);
    const toastId = 'bulk-classify';
    toast.loading(`⚙ تصنيف ${unclassifiedTickets.length} تذكرة...`, { id: toastId, duration: Infinity });
    let done = 0, failed = 0;
    for (const ticket of unclassifiedTickets) {
      if (!ticket.description || !ticket.projectId) { failed++; done++; continue; }
      try {
        const result = await classifyOnServer({ description: ticket.description, projectId: ticket.projectId });
        if (result.primaryType && result.primaryType !== 'unclassified') {
          await ticketsApi.update(ticket.id, {
            type: result.primaryType,
            detectedTypes: result.allTypes,
            ...(result.supervisors.length > 0 && {
              assignedSupervisorId:  result.supervisors[0].id,
              assignedSupervisorIds: result.supervisors.map(s => s.id),
              assignedSupervisors:   result.supervisors.map(s => ({ id: s.id, name: s.name, specialty: s.specialties[0] ?? 'general' })),
            }),
          });
          done++;
        } else { failed++; done++; }
      } catch { failed++; done++; }
      if (done % 5 === 0)
        toast.loading(`⚙ جارٍ التصنيف: ${done} / ${unclassifiedTickets.length}`, { id: toastId, duration: Infinity });
    }
    toast.success(`تم تصنيف ${done - failed} تذكرة — ${failed} لم يُصنَّف`, { id: toastId, duration: 8000 });
    setBulkClassifying(false);
    loadData();
  };

  const distinctProjectIds = new Set(tickets.map(t => t.projectId).filter(Boolean));
  const showProjectColumn = user?.role === 'admin' || distinctProjectIds.size > 1;

  const selectedTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
  const uniqueClientIds = new Set(selectedTickets.map(t => t.clientId || t.villaNumber || 'unknown'));

  return (
    <Layout>
      <div className="space-y-5 page-in">

        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">تذاكر الصيانة</h1>
            <p className="text-muted-foreground mt-1 text-sm">إدارة ومتابعة طلبات الصيانة لجميع المشاريع</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {(user?.role === 'admin' || user?.role === 'engineer') && (
              <UnifiedImportModal
                trigger={
                  <Button variant="outline" className="gap-2 rounded-2xl h-10 font-bold border-border">
                    <FileUp className="w-4 h-4" /> استيراد
                  </Button>
                }
                projects={Object.values(projects)}
                clients={Object.values(clients)}
                onImportSuccess={loadData}
                currentUserId={user?.uid}
              />
            )}

            {(user?.role === 'admin' || user?.role === 'engineer') && <TicketForm onSuccess={loadData} />}

            {(user?.role === 'admin' || user?.role === 'engineer') && (
              <Button
                onClick={handleReassignSupervisors}
                disabled={reassigning}
                variant="outline"
                className="gap-2 rounded-2xl h-10 border-amber-500/30 bg-amber-500/5 text-amber-500 hover:border-amber-500/60 hover:bg-amber-500/10 font-bold"
              >
                {reassigning
                  ? <><span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /> جارٍ التعيين...</>
                  : '⚡ إعادة تعيين المشرفين'}
              </Button>
            )}

            {import.meta.env.DEV && user?.role === 'admin' && (
              <Button
                onClick={handleDeleteAll}
                variant="outline"
                className={cn('gap-2 rounded-2xl h-10 border font-bold transition-all',
                  deleteConfirm
                    ? 'border-red-500 bg-red-500/20 text-red-400 animate-pulse'
                    : 'border-red-500/30 bg-red-500/5 text-red-500'
                )}
              >
                <AlertTriangle className="w-4 h-4" />
                {deleteConfirm ? 'تأكيد الحذف' : 'حذف الكل'}
              </Button>
            )}
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <Tabs defaultValue="linked" className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <TabsList className="bg-muted/50 border border-border h-10 p-1 rounded-2xl w-full sm:w-auto">
              <TabsTrigger
                value="linked"
                className="rounded-xl text-sm font-bold px-4 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
              >
                المربوطة ({linkedTickets.length})
              </TabsTrigger>
              {unlinkedTickets.length > 0 && (
                <TabsTrigger
                  value="unlinked"
                  className="rounded-xl text-sm font-bold px-4 data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=active]:shadow-md flex items-center gap-2 transition-all"
                >
                  غير مربوطة
                  <Badge variant="destructive" className="h-4.5 px-1.5 min-w-5 text-[9px] font-black">
                    {unlinkedTickets.length}
                  </Badge>
                </TabsTrigger>
              )}
              {unclassifiedTickets.length > 0 && (
                <TabsTrigger
                  value="unclassified"
                  className="rounded-xl text-sm font-bold px-4 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md flex items-center gap-2 transition-all"
                >
                  غير مصنفة
                  <Badge className="h-4.5 px-1.5 min-w-5 text-[9px] font-black bg-orange-500 text-white border-0">
                    {unclassifiedTickets.length}
                  </Badge>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="unlinked" className="mt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleAutoLink}
                  disabled={autoLinking || unlinkedTickets.length === 0}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-10 rounded-2xl shadow-md"
                >
                  {autoLinking ? 'جارٍ الربط...' : '⚡ ربط تلقائي'}
                </Button>
                
                <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

                <ClientForm trigger={
                  <Button variant="outline" className="h-10 rounded-2xl font-bold border-border bg-card hover:bg-muted transition-all">
                    <UserPlus className="w-4 h-4 ml-2 text-primary" />
                    إضافة عميل جديد
                  </Button>
                } onSuccess={loadData} />

                <Link to="/clients">
                  <Button variant="outline" className="h-10 rounded-2xl font-bold border-border bg-card hover:bg-muted transition-all">
                    <User className="w-4 h-4 ml-2 text-slate-400" />
                    صفحة العملاء
                  </Button>
                </Link>
              </div>
            </TabsContent>
          </div>

          <TabsContent value="linked" className="mt-0">
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <TicketTable
                tickets={linkedTickets}
                selectedIds={selectedTicketIds}
                onSelectionChange={setSelectedTicketIds}
                hideProjectColumn={!showProjectColumn}
                projects={projects}
                showInlineFilters
              />
            </div>
          </TabsContent>

          <TabsContent value="unlinked" className="mt-0">
            <div className="bg-card border border-red-500/25 rounded-3xl overflow-hidden shadow-sm">
              <div className="p-4 bg-red-500/8 border-b border-red-500/20 text-red-500 font-semibold flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                هذه التذاكر لا تحتوي على بيانات عميل أو رقم الفيلا غير مسجل في قائمة العملاء
              </div>
              <TicketTable
                tickets={unlinkedTickets}
                selectedIds={selectedTicketIds}
                onSelectionChange={setSelectedTicketIds}
                hideProjectColumn={!showProjectColumn}
                projects={projects}
                showInlineFilters
                onRefresh={loadData}
              />
            </div>
          </TabsContent>

          <TabsContent value="unclassified" className="mt-0">
            <div className="bg-card border border-orange-500/25 rounded-3xl overflow-hidden shadow-sm">
              <div className="p-3 bg-orange-500/8 border-b border-orange-500/20 flex items-center justify-between gap-3">
                <Button
                  onClick={handleBulkReclassify}
                  disabled={bulkClassifying || unclassifiedTickets.length === 0}
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-9 rounded-xl shadow-md gap-2 shrink-0"
                >
                  {bulkClassifying
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جارٍ التصنيف...</>
                    : <><HelpCircle className="w-3.5 h-3.5" /> تصنيف الكل تلقائياً</>}
                </Button>
                <div className="flex items-center gap-2 text-orange-500 text-sm font-semibold">
                  <HelpCircle className="w-4 h-4 shrink-0" />
                  <span>هذه التذاكر لم تُصنَّف — يمكن تصنيفها تلقائياً أو يدوياً من قائمة كل تذكرة</span>
                </div>
              </div>
              <TicketTable
                tickets={unclassifiedTickets}
                selectedIds={selectedTicketIds}
                onSelectionChange={setSelectedTicketIds}
                hideProjectColumn={!showProjectColumn}
                projects={projects}
                showInlineFilters
                onRefresh={loadData}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Bulk bar */}
        {selectedTicketIds.length > 0 && (
          <BulkActionBar
            count={selectedTicketIds.length}
            isMultiClient={uniqueClientIds.size > 1}
            onStatusChange={handleBulkStatusChange}
            onAppointment={handleSendAppointment}
            onClose={() => setCloseDialogOpen(true)}
            onClear={() => setSelectedTicketIds([])}
            hidden={closeDialogOpen}
          />
        )}

        <CloseTicketDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          selectedTickets={tickets.filter(t => selectedTicketIds.includes(t.id))}
          clients={Object.values(clients)}
          projects={projects}
          onSuccess={() => { setSelectedTicketIds([]); setCloseDialogOpen(false); loadData(); }}
        />

        {apptTicket && apptTicket.length > 0 && (
          <AppointmentDialog
            open={apptOpen}
            onOpenChange={setApptOpen}
            tickets={apptTicket.map(t => ({
              id: t.id,
              ticketId: t.ticketId,
              clientName: t.clientName,
              villaNumber: t.villaNumber,
              appointmentTime: t.appointmentTime,
              appointmentNotes: t.appointmentNotes,
              assignedSupervisorIds: t.assignedSupervisorIds as string[] | undefined,
              status: t.status,
            }))}
            clientPhone={
              clients[apptTicket[0].clientId || '']?.phone || 
              Object.values(clients).find(c => c.villaNumber === apptTicket[0].villaNumber)?.phone
            }
            onSuccess={() => { setApptOpen(false); setSelectedTicketIds([]); loadData(); }}
          />
        )}


      </div>
    </Layout>
  );
}
