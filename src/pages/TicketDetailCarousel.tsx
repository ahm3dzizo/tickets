import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  ImageIcon,
  MapPin,
  MessageSquareText,
  Paperclip,
  Pencil,
  PhoneCall,
  Tag,
  User,
  Users,
  Zap,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { ReassignSupervisorButton } from '@/components/tickets/ReassignSupervisorButton';
import { TicketMediaCarousel } from '@/components/tickets/TicketMediaCarousel';
import { UnifiedAppointmentDialog } from '@/components/tickets/UnifiedAppointmentDialog';
import { ticketsApi, projectsApi, clientsApi, auditApi, settingsApi, whatsappApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatTicketDate, formatTicketDateTime } from '@/lib/ticketDate';
import { extractTicketMedia } from '@/lib/ticketMedia';
import { ticketDetailText } from '@/i18n/ticketDetail';
import { invalidateTicketCache } from '@/lib/ticketCache';
import { Client, Project, Ticket } from '@/types';
import { toast } from 'sonner';

const t = ticketDetailText.ar;
const STATUS_OPTIONS = ['open', 'in_progress', 'waiting', 'pending', 'completed', 'closed', 'absent', 'out_of_scope'] as const;
const PRIORITY_OPTIONS = ['9', '7', '6', '4', '3'] as const;

function normalizeStatus(status: string): string {
  if (status === 'in-progress') return 'in_progress';
  if (status === 'out-of-scope') return 'out_of_scope';
  return status;
}

function statusClass(status: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === 'closed' || normalized === 'completed') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (normalized === 'pending' || normalized === 'waiting') return 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (normalized === 'out_of_scope' || normalized === 'absent') return 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400';
  return 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400';
}

function priorityClass(priority: Ticket['priority']): string {
  const value = String(priority);
  if (value === '9' || value === 'urgent') return 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400';
  if (value === '7' || value === 'high') return 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (value === '6' || value === '4' || value === 'medium') return 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400';
  return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
}

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('966')) return digits;
  if (digits.startsWith('0')) return `966${digits.slice(1)}`;
  if (digits.length === 9) return `966${digits}`;
  return digits;
}

function appointmentDisplay(ticket: Ticket): string {
  if (ticket.appointment?.date) {
    const date = formatTicketDate(ticket.appointment.date) ?? ticket.appointment.date;
    return ticket.appointment.time ? `${date} · ${ticket.appointment.time}` : date;
  }
  if (ticket.appointmentTime) return formatTicketDateTime(ticket.appointmentTime) ?? ticket.appointmentTime;
  return t.appointmentNotSet;
}

function CompactInfo({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary ring-1 ring-primary/10">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 min-w-0 break-words text-sm font-bold leading-6 text-foreground">{children}</div>
      </div>
    </div>
  );
}

export default function TicketDetailCarousel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [showAllAudit, setShowAllAudit] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editStatus, setEditStatus] = useState('open');
  const [editPriority, setEditPriority] = useState('3');
  const [editDescription, setEditDescription] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const ticketData = await ticketsApi.get(id);
      if (!ticketData) {
        toast.error(t.notFound);
        navigate('/tickets');
        return;
      }

      const nextTicket = ticketData as Ticket;
      setTicket(nextTicket);

      const [projectData, auditData] = await Promise.all([
        nextTicket.projectId ? projectsApi.get(nextTicket.projectId) : Promise.resolve(null),
        auditApi.getForTicket(id).catch(() => []),
      ]);

      setProject((projectData as Project | null) ?? null);
      setAuditLog(Array.isArray(auditData) ? auditData : []);

      if (nextTicket.clientId && nextTicket.projectId) {
        const scopedClients = await clientsApi.getByProject(nextTicket.projectId);
        setClient((scopedClients as Client[]).find(item => item.id === nextTicket.clientId) ?? null);
      } else {
        setClient(null);
      }
    } catch {
      toast.error(t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const media = useMemo(() => extractTicketMedia(ticket?.description), [ticket?.description]);
  const types = useMemo(() => {
    if (!ticket) return [];
    const raw = ticket.detectedTypes?.length ? ticket.detectedTypes : [ticket.type];
    return [...new Set(raw.filter(Boolean))];
  }, [ticket]);

  const openEdit = () => {
    if (!ticket) return;
    setEditStatus(normalizeStatus(ticket.status));
    setEditPriority(String(ticket.priority));
    setEditDescription(ticket.description ?? '');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!ticket) return;
    setEditSaving(true);
    try {
      await ticketsApi.update(ticket.id, {
        status: editStatus,
        priority: Number.isFinite(Number(editPriority)) ? Number(editPriority) : editPriority,
        description: editDescription,
      });
      invalidateTicketCache();
      toast.success(t.updateSuccess);
      setEditOpen(false);
      await loadData();
    } catch {
      toast.error(t.updateFailed);
    } finally {
      setEditSaving(false);
    }
  };

  const sendWhatsApp = async () => {
    if (!ticket) return;
    const phone = normalizePhone(client?.phone);
    if (!phone) {
      toast.error(t.phoneMissing);
      return;
    }

    setWaSending(true);
    try {
      const templates = await settingsApi.getWhatsAppTemplates();
      const template = templates.openingMsg || t.whatsappDefault;
      const message = template
        .replace(/{ticketId}/g, ticket.ticketId || '')
        .replace(/{description}/g, media.cleanText || ticket.description || '')
        .replace(/{unitNumber}/g, ticket.unitNumber || '');
      const response = await whatsappApi.send(phone, message);
      if (!response?.sent) throw new Error('send_failed');
      toast.success(t.whatsappSent);
    } catch {
      toast.error(t.whatsappFailed);
    } finally {
      setWaSending(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground" dir="rtl">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <span className="text-sm">{t.loading}</span>
        </div>
      </Layout>
    );
  }

  if (!ticket) return null;

  const issueDate = formatTicketDate(ticket.issuedAt) ?? t.notAvailable;
  const createdDate = formatTicketDate(ticket.createdAt) ?? t.notAvailable;
  const closedDate = ticket.closedAt ? formatTicketDate(ticket.closedAt) ?? t.notAvailable : t.notClosedYet;
  const statusLabel = t.statuses[ticket.status] ?? t.statuses[normalizeStatus(ticket.status)] ?? ticket.status;
  const priorityLabel = t.priorities[String(ticket.priority)] ?? String(ticket.priority);
  const displayAudit = showAllAudit ? auditLog : auditLog.slice(0, 4);
  const clientPhone = normalizePhone(client?.phone);

  return (
    <Layout>
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 overflow-x-hidden pb-8" dir="rtl">
        <Card className="w-full min-w-0 overflow-hidden rounded-[28px] border-border/70 bg-card shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-primary/5 text-primary"
                onClick={() => navigate('/tickets')}
                title={t.back}
              >
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Button>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="min-w-0 flex-1 break-words text-xl font-black tracking-tight text-foreground sm:text-2xl">
                    {t.ticketTitle} #{ticket.ticketId}
                  </h1>

                  {clientPhone && (
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={`tel:+${clientPhone}`}
                        aria-label={t.callClient}
                        title={t.callClient}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary transition-colors hover:bg-primary/10"
                      >
                        <PhoneCall className="h-4 w-4" />
                      </a>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={t.contactClient}
                        title={t.contactClient}
                        className="h-9 w-9 rounded-xl border-emerald-500/25 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                        disabled={waSending}
                        onClick={sendWhatsApp}
                      >
                        <MessageSquareText className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                  {ticket.unitNumber && (
                    <span className="rounded-lg bg-muted/60 px-2.5 py-1 text-xs font-bold text-foreground">
                      {t.villa}{' '}
                      {ticket.unitId ? (
                        <Link to={`/units/${ticket.unitId}`} className="text-primary hover:underline">
                          {ticket.unitNumber}
                        </Link>
                      ) : ticket.unitNumber}
                    </span>
                  )}
                  {client?.name && (
                    <span className="max-w-full break-words rounded-lg bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground">
                      {client.name}
                    </span>
                  )}
                  <Badge variant="outline" className={cn('rounded-full px-3 py-1 text-xs font-black', priorityClass(ticket.priority))}>
                    {priorityLabel}
                  </Badge>
                  <Badge variant="outline" className={cn('rounded-full px-3 py-1 text-xs font-black', statusClass(ticket.status))}>
                    {statusLabel}
                  </Badge>
                </div>

                {media.cleanText && (
                  <div className="mt-4 min-w-0 rounded-2xl bg-muted/35 px-3.5 py-3 sm:px-4">
                    <p className="mb-1 text-[11px] font-bold text-muted-foreground">{t.description}</p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
                      {media.cleanText}
                    </p>
                  </div>
                )}

                {(types.length > 0 || ticket.subTypeName) && (
                  <div className="mt-3 flex min-w-0 items-start gap-2 rounded-2xl border border-border/60 px-3.5 py-2.5">
                    <Tag className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-muted-foreground">{t.type}</p>
                      <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm font-bold text-foreground">
                        {types.map(type => <span key={type}>{t.types[type] ?? type}</span>)}
                        {ticket.subTypeName && <span className="text-muted-foreground">· {ticket.subTypeName}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="w-full min-w-0 overflow-hidden rounded-[28px] border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3.5 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base font-black">
              <FileText className="h-5 w-5 text-primary" />
              {t.ticketInfo}
            </CardTitle>
            <Button variant="ghost" size="sm" className="rounded-xl bg-primary/5 text-primary" onClick={openEdit}>
              <Pencil className="me-1.5 h-4 w-4" />
              {t.edit}
            </Button>
          </CardHeader>

          <CardContent className="min-w-0 px-4 py-3 sm:px-5">
            <div className="grid min-w-0 grid-cols-1 divide-y divide-border/50 md:grid-cols-2 md:divide-x md:divide-y-0 md:divide-x-reverse">
              <div className="min-w-0 space-y-0 md:pe-5">
                <CompactInfo icon={AlertCircle} label={t.priority}>
                  <Badge variant="outline" className={cn('rounded-full px-3 py-1 text-xs font-black', priorityClass(ticket.priority))}>
                    {priorityLabel}
                  </Badge>
                </CompactInfo>
                <CompactInfo icon={BriefcaseBusiness} label={t.project}>
                  {project ? (
                    <Link to={`/projects/${project.id}`} className="text-primary hover:underline">
                      {project.name}
                    </Link>
                  ) : t.notAvailable}
                </CompactInfo>
                <CompactInfo icon={MapPin} label={t.location}>{project?.location || t.notAvailable}</CompactInfo>
              </div>

              <div className="min-w-0 space-y-0 pt-2 md:ps-5 md:pt-0">
                <CompactInfo icon={User} label={t.supervisor}>
                  {ticket.assignedSupervisorId ? (
                    <Link to={`/team/${ticket.assignedSupervisorId}`} className="text-primary hover:underline">
                      {ticket.assigneeName || t.notAvailable}
                    </Link>
                  ) : ticket.assigneeName || t.notAvailable}
                </CompactInfo>
                <CompactInfo icon={Users} label={t.supervisors}>
                  {ticket.assignedSupervisors?.length ? (
                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                      {ticket.assignedSupervisors.map(supervisor => (
                        <Link key={supervisor.id} to={`/team/${supervisor.id}`} className="text-primary hover:underline">
                          {supervisor.name}
                        </Link>
                      ))}
                    </div>
                  ) : t.notAvailable}
                </CompactInfo>
                <CompactInfo icon={CalendarDays} label={t.issueDate}>
                  <span className="tabular-nums" dir="ltr">{issueDate}</span>
                </CompactInfo>
                <CompactInfo icon={CalendarDays} label={t.createdDate}>
                  <span className="tabular-nums" dir="ltr">{createdDate}</span>
                </CompactInfo>
                <CompactInfo icon={Clock3} label={t.closedDate}>
                  <span className={cn('tabular-nums', ticket.closedAt && 'text-emerald-600 dark:text-emerald-400')} dir="ltr">
                    {closedDate}
                  </span>
                </CompactInfo>
              </div>
            </div>

            {(ticket.appointmentTime || ticket.appointment?.date) && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-semibold">{t.visitAppointment}: </span>
                  <span className="tabular-nums text-foreground" dir="ltr">{appointmentDisplay(ticket)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-full min-w-0 overflow-hidden rounded-[28px] border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border/60 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base font-black">
                <ImageIcon className="h-5 w-5 shrink-0 text-primary" />
                {t.mediaTitle}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{t.mediaSubtitle}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary">
              {t.mediaViewerOnly}
            </span>
          </CardHeader>
          <CardContent className="min-w-0 p-3 sm:p-5">
            <TicketMediaCarousel items={media.items} />
          </CardContent>
        </Card>

        <Card className="w-full min-w-0 overflow-hidden rounded-[28px] border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 px-4 py-3.5 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base font-black">
              <Zap className="h-5 w-5 text-primary" />
              {t.quickActions}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 grid-cols-1 gap-2 p-3 min-[390px]:grid-cols-2 sm:p-4 md:grid-cols-4">
            <Button className="h-14 min-w-0 rounded-2xl bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300" onClick={() => setAppointmentOpen(true)}>
              <CalendarDays className="me-2 h-4 w-4 shrink-0" />
              <span className="truncate">{t.scheduleAppointment}</span>
            </Button>
            <div className="min-w-0 [&>button]:h-14 [&>button]:w-full [&>button]:min-w-0 [&>button]:justify-center [&>button]:overflow-hidden [&>button]:border-amber-500/20 [&>button]:bg-amber-500/10 [&>button]:text-amber-700 dark:[&>button]:text-amber-300">
              <ReassignSupervisorButton ticket={ticket} onReassigned={loadData} />
            </div>
            <Button variant="outline" className="h-14 min-w-0 rounded-2xl border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300" onClick={openEdit}>
              <MessageSquareText className="me-2 h-4 w-4 shrink-0" />
              <span className="truncate">{t.addNote}</span>
            </Button>
            <Button variant="outline" className="h-14 min-w-0 rounded-2xl border-violet-500/20 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 dark:text-violet-300" onClick={openEdit}>
              <Paperclip className="me-2 h-4 w-4 shrink-0" />
              <span className="truncate">{t.addAttachment}</span>
            </Button>
          </CardContent>
        </Card>

        <Card className="w-full min-w-0 overflow-hidden rounded-[28px] border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3.5 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base font-black">
              <Clock3 className="h-5 w-5 text-primary" />
              {t.auditTitle}
            </CardTitle>
            {auditLog.length > 4 && (
              <Button variant="ghost" size="sm" className="rounded-xl bg-primary/5 text-primary" onClick={() => setShowAllAudit(value => !value)}>
                {showAllAudit ? t.showLess : t.showAll}
              </Button>
            )}
          </CardHeader>
          <CardContent className="min-w-0 p-4 sm:p-5">
            {displayAudit.length ? (
              <div className="space-y-0">
                {displayAudit.map((entry: any, index: number) => (
                  <div key={entry.id ?? `${entry.changedAt}-${index}`} className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
                    <div className="flex w-5 shrink-0 justify-center">
                      <span className="z-10 mt-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/10" />
                      {index < displayAudit.length - 1 && <span className="absolute top-4 bottom-0 w-px bg-border" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 break-words text-sm font-semibold">
                          <span>{entry.changedByName || entry.changedBy || t.notAvailable}</span>{' '}
                          <span className="text-muted-foreground">{t.changed}</span>{' '}
                          <span className="text-primary">{entry.field}</span>
                        </p>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dir="ltr">
                          {formatTicketDateTime(entry.changedAt) ?? t.notAvailable}
                        </span>
                      </div>
                      {(entry.oldValue || entry.newValue) && (
                        <div className="mt-1.5 flex min-w-0 flex-wrap gap-2 text-xs">
                          {entry.oldValue && <span className="break-all text-rose-500 line-through">{entry.oldValue}</span>}
                          {entry.newValue && <span className="break-all font-medium text-emerald-600 dark:text-emerald-400">{entry.newValue}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">{t.noAudit}</div>
            )}
          </CardContent>
        </Card>

        {ticket.status !== 'closed' && (
          <div className="flex justify-end">
            <Button variant="outline" className="rounded-xl border-emerald-500/30 text-emerald-700 dark:text-emerald-300" onClick={() => setCloseOpen(true)}>
              <CheckCircle2 className="me-2 h-4 w-4" />
              {t.closeTicket}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto rounded-3xl sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{t.editTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">{t.status}</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue placeholder={t.selectStatus} /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(value => <SelectItem key={value} value={value}>{t.statuses[value]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">{t.priority}</label>
              <Select value={editPriority} onValueChange={setEditPriority}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue placeholder={t.selectPriority} /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(value => <SelectItem key={value} value={value}>{t.priorities[value]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">{t.description}</label>
              <Textarea
                value={editDescription}
                onChange={event => setEditDescription(event.target.value)}
                placeholder={t.descriptionPlaceholder}
                className="min-h-36 rounded-xl text-right"
              />
              <p className="text-[11px] leading-5 text-muted-foreground">{t.videoLinkHint}</p>
            </div>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button onClick={saveEdit} disabled={editSaving} className="w-full rounded-xl sm:w-auto">
              {editSaving ? t.saving : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CloseTicketDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        selectedTickets={[ticket]}
        clients={client ? [client] : []}
        projects={project ? { [project.id]: project } : undefined}
        onSuccess={() => {
          setCloseOpen(false);
          loadData();
        }}
      />

      <UnifiedAppointmentDialog
        open={appointmentOpen}
        onOpenChange={setAppointmentOpen}
        tickets={[{
          id: ticket.id,
          ticketId: ticket.ticketId,
          clientName: ticket.clientName,
          unitNumber: ticket.unitNumber,
          unitId: ticket.unitId ?? undefined,
          projectId: ticket.projectId,
          clientId: ticket.clientId,
          appointmentId: ticket.appointmentId,
          appointmentTime: ticket.appointmentTime,
          type: ticket.type as string,
          detectedTypes: ticket.detectedTypes,
          assignedSupervisorIds: ticket.assignedSupervisorIds,
          status: ticket.status,
        }]}
        clientPhone={client?.phone}
        onSuccess={() => {
          setAppointmentOpen(false);
          loadData();
        }}
      />
    </Layout>
  );
}
