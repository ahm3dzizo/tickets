import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  MapPin, 
  Users, 
  Ticket as TicketIcon,
  Plus,
  UserCheck,
  Clock,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Project, Ticket, Client, User } from '@/types';
import { ticketsApi, projectsApi, clientsApi, usersApi } from '@/lib/api';
import { ProjectForm } from '@/components/projects/ProjectForm';

import { TicketTable, BulkActionBar } from '@/components/tickets/TicketTable';
import { ClientForm } from '@/components/clients/ClientForm';
import { TicketForm } from '@/components/tickets/TicketForm';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { AssignContractorDialog } from '@/components/tickets/AssignContractorDialog';
import { UnifiedImportModal } from '@/components/tickets/UnifiedImportModal';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ReportsSection } from '@/components/reports/ReportsSection';


export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [engineers, setEngineers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [contractorDialogOpen, setContractorDialogOpen] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      const [projectData, allTickets, projectClients, allUsers] = await Promise.all([
        projectsApi.get(id),
        ticketsApi.getAll({ projectId: id }),
        clientsApi.getByProject(id),
        usersApi.getAll(),
      ]);
      if (!projectData) { navigate('/projects'); return; }
      setProject(projectData as Project);
      setTickets(allTickets as Ticket[]);
      setClients(projectClients as Client[]);
      const engs = (allUsers as User[]).filter(u => (projectData as Project).engineerIds?.includes(u.uid));
      setEngineers(engs);
    } catch (err) {
      console.error('ProjectDetail load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [id, navigate]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </Layout>
    );
  }

  if (!project) return null;

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    try {
      await ticketsApi.bulkStatus(selectedTicketIds, newStatus);
      toast.success('تم تحديث حالة التذاكر المختارة');
      setSelectedTicketIds([]);
      loadData();
    } catch (error) {
      console.error('Error updating tickets:', error);
      toast.error('فشل تحديث حالة التذاكر');
    }
  };

  const handleSendWhatsApp = () => {
    if (selectedTicketIds.length === 0) return;

    // Group selected tickets by villa/client
    const selectedTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
    const byVilla: Record<string, Ticket[]> = {};
    
    selectedTickets.forEach(t => {
      if (!byVilla[t.unitId]) byVilla[t.unitId] = [];
      byVilla[t.unitId].push(t);
    });

    // For now, let's process the first villa's tickets to avoid pop-up blockers
    const unitIds = Object.keys(byVilla);
    if (unitIds.length > 1) {
      toast.info('سيتم فتح واتساب لأول فيلا مختارة فقط حالياً');
    }

    const targetUnitId = unitIds[0];
    const unitTickets = byVilla[targetUnitId];
    const firstTicket = unitTickets[0];
    const targetUnitNumber =
      (firstTicket as any).unitNumber ||
      (firstTicket as any).unit?.unitNumber ||
      targetUnitId;

    const client = clients.find(c => c.id === firstTicket.clientId || c.phone === firstTicket.clientId); // Fallback handle
    
    // We might need to find client by villa if ID is missing or mismatched
    const targetClient = client || clients.find(c => String(c.unitId) === String(targetUnitId));

    if (!targetClient?.phone) {
      toast.error('لم يتم العثور على رقم هاتف لهذا العميل');
      return;
    }

    const ticketIdsList = unitTickets.map(t => t.ticketId || t.refNumber).join('، ');
    const message = `السلام عليكم، بخصوص بلاغ الصيانة رقم ${ticketIdsList} لوحدتكم وحدة ${targetUnitNumber}، نرجو إفادتنا بمواعيد تواجدكم لتنسيق موعد الصيانة.`;
    
    const phone = targetClient.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700">
        {/* ── Header ── */}
        <div className="flex flex-col gap-3">

          {/* صف العنوان + زر الرجوع */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost" size="icon"
              className="text-slate-400 hover:text-white rounded-2xl bg-white/5 shrink-0"
              onClick={() => navigate('/projects')}
            >
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] uppercase font-bold px-2.5">
                  {project.abbreviation}
                </Badge>
              </div>
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight truncate">{project.name}</h1>
            </div>
            {/* زر تعديل المشروع — للأدمن فقط */}
            {currentUser?.role === 'admin' && (
              <ProjectForm project={project} onSuccess={loadData} />
            )}
          </div>

          {/* صف الأزرار — يلف على موبايل */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'engineer') && (
            <div className="flex flex-wrap items-center gap-2">
              <UnifiedImportModal
                trigger={
                  <Button variant="outline"
                    className="border-border bg-white/5 text-slate-400 hover:text-white rounded-xl gap-1.5 h-9 px-3 text-sm">
                    <Plus className="w-3.5 h-3.5" />
                    استيراد تذاكر
                  </Button>
                }
                projects={project ? [project] : []}
                clients={clients}
                onImportSuccess={loadData}
                currentUserId={currentUser?.uid}
              />
              {clients.length === 0 && (
                <Button variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-300 hover:text-white rounded-xl gap-1.5 h-9 px-3 text-sm"
                  onClick={() => navigate('/clients')}>
                  ⚠️ لا يوجد عملاء
                </Button>
              )}
              <ClientForm projectId={project.id} onSuccess={loadData} />
              <TicketForm  projectId={project.id} onSuccess={loadData} />
            </div>
          )}
        </div>

        {/* Action Bar for selected tickets */}
        {selectedTicketIds.length > 0 && (() => {
          const selTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
          const uniqueClientKeys = new Set(selTickets.map(t => t.clientId || t.unitId || t.id));
          const isMultiClient = uniqueClientKeys.size > 1;
          return (
            <BulkActionBar
              count={selectedTicketIds.length}
              isMultiClient={isMultiClient}
              onStatusChange={handleBulkStatusChange}
              onAppointment={handleSendWhatsApp}
              onContractor={() => setContractorDialogOpen(true)}
              onClose={() => setIsCloseDialogOpen(true)}
              onClear={() => setSelectedTicketIds([])}
              statusOptions={[
                { key: 'open', label: 'مفتوحة' },
                { key: 'in-progress', label: 'جاري العمل' },
                { key: 'waiting', label: 'بانتظار الموعد' },
                { key: 'contractor', label: 'مقاول' },
              ]}
            />
          );
        })()}

        {/* Primary Content: Tickets Table */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-white">إدارة تذاكر المشروع</h2>
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-black/40">
            <TicketTable
              tickets={tickets}
              selectedIds={selectedTicketIds}
              onSelectionChange={setSelectedTicketIds}
              hideSupervisorColumn={currentUser?.role === 'supervisor'}
              emptyMessage="لا توجد تذاكر مسجلة لهذا المشروع"
              maxHeight="calc(100vh - 320px)"
              showInlineFilters
            />
          </div>
        </div>

        {/* Statistics and Secondary Info */}
        <div className="grid grid-cols-12 gap-6 sm:gap-8">
          <div className="col-span-12 lg:col-span-8 space-y-6 sm:space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
                    <TicketIcon className="w-6 h-6" />
                  </div>
                  <div className="text-2xl font-black text-white">{tickets.length}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">إجمالي التذاكر</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div className="text-2xl font-black text-white">{clients.length}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">إجمالي العملاء</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div className="text-2xl font-black text-white">{tickets.filter(t => t.status === 'open').length}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">تذاكر مفتوحة</div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-8">
            <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
              <CardHeader className="border-b border-white/5 p-6">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">معلومات المشروع</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                      الموقع
                    </div>
                    <span className="text-xs text-slate-300 font-bold">{project.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Users className="w-3.5 h-3.5" />
                      المهندسين
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {engineers.map(eng => (
                        <span key={eng.uid} className="text-xs text-slate-300">{eng.displayName}</span>
                      ))}
                      {engineers.length === 0 && <span className="text-xs text-slate-500">لا يوجد</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
                </div>
      </div>

      {/* Reports & Charts Section - Project-specific */}
      <ReportsSection tickets={tickets} projects={project ? [project] : []} userRole={currentUser?.role} />

      <CloseTicketDialog  
        open={isCloseDialogOpen}
        onOpenChange={setIsCloseDialogOpen}
        selectedTickets={tickets.filter(t => selectedTicketIds.includes(t.id))}
        clients={clients}
        onSuccess={() => { setSelectedTicketIds([]); loadData(); }}
      />

      <AssignContractorDialog
        open={contractorDialogOpen}
        onOpenChange={setContractorDialogOpen}
        tickets={tickets.filter(t => selectedTicketIds.includes(t.id))}
        projectId={project?.id || ''}
        onSuccess={() => { setContractorDialogOpen(false); setSelectedTicketIds([]); loadData(); }}
      />
    </Layout>
  );
}
