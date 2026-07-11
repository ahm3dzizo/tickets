// src/pages/TicketsList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertTriangle, FileUp, User, UserPlus, HelpCircle, Loader2, Plus, HardHat, MoreHorizontal, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TicketForm } from '@/components/tickets/TicketForm';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { TicketTable, parseIssuedAt, BulkActionBar } from '@/components/tickets/TicketTable';
import { UnifiedImportModal } from '@/components/tickets/UnifiedImportModal';
import { AppointmentDialog } from '@/components/tickets/AppointmentDialog';
import { SaveInternalAppointmentDialog } from '@/components/tickets/SaveInternalAppointmentDialog';
import { AssignContractorDialog } from '@/components/tickets/AssignContractorDialog';
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
  const [internalApptOpen, setInternalApptOpen] = useState(false);
  const [contractorDialogOpen, setContractorDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('ticketsListTab') || 'linked');

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
    finally { 
      setLoading(false); 
      const scrollY = sessionStorage.getItem('ticketsListScrollY');
      if (scrollY) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(scrollY, 10));
          sessionStorage.removeItem('ticketsListScrollY');
        }, 100);
      }
    }
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

  const handleAppointment = () => {
    const selected = tickets.filter(t => selectedTicketIds?.includes(t.id));
    if (selected.length === 0) return;
    setApptTicket(selected);
    setApptOpen(true);
  };

  const handleInternalAppointment = () => {
    const selected = tickets.filter(t => selectedTicketIds?.includes(t.id));
    if (selected.length === 0) return;
    setApptTicket(selected);
    setInternalApptOpen(true);
  };

  const handleAutoLink = async () => {
    setAutoLinking(true);
    try {
      const data = await ticketsApi.autoLink();
      toast.success(data.message);
      if (data.count > 0) loadData();
    } catch (err: any) { toast.error(err.message || 'فشل عملية الربط التلقائي'); }
    finally { setAutoLinking(false); }
  };

  const unlinkedTickets      = tickets.filter(t => !t.clientId);
  const linkedTickets        = tickets.filter(t => !!t.clientId && t.status !== 'contractor');
  const contractorTickets    = tickets.filter(t => t.status === 'contractor');
  // Unclassified = no type OR explicitly "unclassified" (new fallback)
  const unclassifiedTickets  = tickets.filter(t => !t.type || t.type === 'unclassified');

  const [bulkClassifying, setBulkClassifying] = useState(false);
  const [ticketFormOpen, setTicketFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  const selectedTickets = tickets.filter(t => selectedTicketIds?.includes(t.id));
  const uniqueClientIds = new Set(selectedTickets.map(t => t.clientId || t.villaNumber || 'unknown'));

  return (
    <Layout>
      <div className="space-y-5 page-in">

        {/* ── Header (compact single row) ──────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight text-right">تذاكر الصيانة</h1>

          {(user?.role === 'admin' || user?.role === 'engineer') && (
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 h-10 rounded-xl shadow-sm transition-all shrink-0 font-bold gap-2">
                  <Plus className="w-5 h-5" />
                  <span className="hidden sm:inline">إضافة تذاكر</span>
                </Button>
              } />
              <DropdownMenuContent align="end" className="w-56 bg-card border-border rounded-xl p-1">
                <DropdownMenuItem onClick={() => setTicketFormOpen(true)} className="gap-2.5 cursor-pointer rounded-lg py-2.5 font-bold">
                  <Plus className="w-4 h-4 text-blue-500" /> تذكرة جديدة
                </DropdownMenuItem>

                <div className="my-1 border-t border-border/50" />

                <DropdownMenuItem onClick={() => setImportOpen(true)} className="gap-2.5 cursor-pointer rounded-lg py-2.5">
                  <FileUp className="w-4 h-4 text-blue-500" /> استيراد التذاكر
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={handleReassignSupervisors}
                  disabled={reassigning}
                  className="gap-2.5 cursor-pointer rounded-lg py-2.5 text-amber-500 focus:text-amber-500 focus:bg-amber-500/10"
                >
                  {reassigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  تعيين المشرفين
                </DropdownMenuItem>

                {import.meta.env.DEV && user?.role === 'admin' && (
                  <DropdownMenuItem
                    onClick={handleDeleteAll}
                    className="gap-2.5 cursor-pointer rounded-lg py-2.5 text-red-500 focus:text-red-500 focus:bg-red-500/10 mt-1 border-t border-border/50"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    {deleteConfirm ? 'تأكيد الحذف' : 'حذف الكل (للتطوير)'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <Tabs 
          value={activeTab} 
          onValueChange={val => { setActiveTab(val); sessionStorage.setItem('ticketsListTab', val); }} 
          className="w-full"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="w-full">
              <TabsList className="bg-transparent h-auto p-0 flex flex-wrap items-center gap-2 w-full">
                <TabsTrigger
                  value="linked"
                  className="rounded-xl h-9 text-sm font-bold px-4 border border-border bg-card data-[state=active]:bg-primary data-[state=active]:border-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                >
                  المربوطة ({linkedTickets.length})
                </TabsTrigger>
                <TabsTrigger
                  value="contractors"
                  className="rounded-xl h-9 text-sm font-bold px-3 border border-border bg-card data-[state=active]:bg-blue-600 data-[state=active]:border-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm flex items-center gap-1.5 transition-all"
                >
                  <HardHat className="w-3.5 h-3.5" />
                  المقاولين
                  {contractorTickets.length > 0 && (
                    <Badge className="h-4.5 px-1.5 min-w-5 text-[9px] font-black bg-blue-500 text-white border-0">
                      {contractorTickets.length}
                    </Badge>
                  )}
                </TabsTrigger>
                {unlinkedTickets.length > 0 && (
                  <TabsTrigger
                    value="unlinked"
                    className="rounded-xl h-9 text-sm font-bold px-4 border border-red-500/20 bg-red-500/5 text-red-500 data-[state=active]:bg-red-500 data-[state=active]:border-red-500 data-[state=active]:text-white data-[state=active]:shadow-sm flex items-center gap-2 transition-all"
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
                    className="rounded-xl h-9 text-sm font-bold px-4 border border-orange-500/20 bg-orange-500/5 text-orange-500 data-[state=active]:bg-orange-500 data-[state=active]:border-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm flex items-center gap-2 transition-all"
                  >
                    غير مصنفة
                    <Badge className="h-4.5 px-1.5 min-w-5 text-[9px] font-black bg-orange-500 text-white border-0">
                      {unclassifiedTickets.length}
                    </Badge>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

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
                stateKey="tl_linked"
              />
            </div>
          </TabsContent>

          <TabsContent value="contractors" className="mt-0">
            <div className="bg-card border border-blue-500/25 rounded-3xl overflow-hidden shadow-sm">
              <div className="p-3 bg-blue-500/8 border-b border-blue-500/20 flex items-center gap-2 text-blue-400 text-sm font-semibold">
                <HardHat className="w-4 h-4 shrink-0" />
                <span>تذاكر المقاولين — يتم عرض التذاكر المسندة لمقاولين خارجيين</span>
              </div>
              <TicketTable
                tickets={contractorTickets}
                selectedIds={selectedTicketIds}
                onSelectionChange={setSelectedTicketIds}
                hideProjectColumn={!showProjectColumn}
                projects={projects}
                showInlineFilters
                onRefresh={loadData}
                stateKey="tl_contractors"
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
                stateKey="tl_unlinked"
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
                stateKey="tl_unclassified"
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
            onAppointment={handleAppointment}
            onInternalAppointment={handleInternalAppointment}
            onContractor={() => setContractorDialogOpen(true)}
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
          onSuccess={() => { setSelectedTicketIds([]); setCloseDialogOpen(false); }}
        />

        <TicketForm
          open={ticketFormOpen}
          onOpenChange={setTicketFormOpen}
          trigger={<span className="hidden" />}
          onSuccess={() => { loadData(); setTicketFormOpen(false); }}
        />

        <UnifiedImportModal
          open={importOpen}
          onOpenChange={setImportOpen}
          trigger={<span className="hidden" />}
          projects={Object.values(projects)}
          clients={Object.values(clients)}
          onImportSuccess={() => { loadData(); setImportOpen(false); }}
          currentUserId={user?.uid}
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
              Object.values(clients).find(c => String(c.villaNumber) === String(apptTicket[0].villaNumber))?.phone
            }
            onSuccess={() => { setApptOpen(false); setSelectedTicketIds([]); loadData(); }}
          />
        )}

        {apptTicket && apptTicket.length > 0 && (
          <SaveInternalAppointmentDialog
            open={internalApptOpen}
            onOpenChange={setInternalApptOpen}
            tickets={apptTicket}
            onSuccess={() => { setInternalApptOpen(false); setSelectedTicketIds([]); loadData(); }}
          />
        )}

        <AssignContractorDialog
          open={contractorDialogOpen}
          onOpenChange={setContractorDialogOpen}
          tickets={selectedTickets}
          projectId={selectedTickets[0]?.projectId || ''}
          onSuccess={() => { setContractorDialogOpen(false); setSelectedTicketIds([]); loadData(); }}
        />

      </div>
    </Layout>
  );
}
