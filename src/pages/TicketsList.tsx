// src/pages/TicketsList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertTriangle, FileUp, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TicketForm } from '@/components/tickets/TicketForm';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { TicketTable, parseIssuedAt, BulkActionBar } from '@/components/tickets/TicketTable';
import { UnifiedImportModal } from '@/components/tickets/UnifiedImportModal';
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
  const [reassigning, setReassigning] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);

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
        `✅ تم تعيين المشرفين لـ ${updates.length} تذكرة` +
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
      const phone = clients[first?.clientId]?.phone ??
        Object.values(clients).find(c => c.villaNumber === first?.villaNumber)?.phone ?? '';
      const ids = clientTickets.map(t => t.ticketId || t.refNumber || t.id).join('، ');
      WhatsAppService.sendUpdate(phone, WhatsAppService.processTemplate(templates.openingMsg, {
        clientName: clients[first?.clientId]?.name || '', ticketId: ids,
        description: first?.description || '', villaNumber: first?.villaNumber || '',
        date: new Date().toLocaleDateString('ar-SA'),
      }));
    });
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

  const unlinkedTickets = tickets.filter(t => !t.clientId);
  const linkedTickets   = tickets.filter(t => !!t.clientId);
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
      </div>
    </Layout>
  );
}
