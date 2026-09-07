import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Link2, Paperclip, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TypesSelector } from '@/components/tickets/TypesSelector';
import { ticketEditApi, ProjectSupervisorOption } from '@/lib/ticketEditApi';
import { classifyTicketMedia, extractTicketMedia, isDisplayableTicketMedia } from '@/lib/ticketMedia';
import { ticketsApi } from '@/lib/api';
import { invalidateTicketCache } from '@/lib/ticketCache';
import { ticketDetailText } from '@/i18n/ticketDetail';
import { ticketEditText } from '@/i18n/ticketEdit';
import { Ticket, TicketType } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const t = ticketEditText.ar;
const detailText = ticketDetailText.ar;
const STATUS_OPTIONS = ['open', 'in_progress', 'waiting', 'pending', 'completed', 'closed', 'absent', 'out_of_scope', 'contractor', 'note'] as const;
const PRIORITY_OPTIONS = ['9', '7', '6', '4', '3'] as const;
const MAX_FILES = 6;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
]);

interface TicketEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  onSaved: () => void | Promise<void>;
}

function normalizeStatus(status: string): string {
  if (status === 'in-progress') return 'in_progress';
  if (status === 'out-of-scope') return 'out_of_scope';
  return status;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const right = new Set(b);
  return a.every(value => right.has(value));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSafeMediaLink(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function TicketEditDialog({ open, onOpenChange, ticket, onSaved }: TicketEditDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('3');
  const [description, setDescription] = useState('');
  const [types, setTypes] = useState<TicketType[]>([]);
  const [subTypeIds, setSubTypeIds] = useState<string[]>([]);
  const [supervisors, setSupervisors] = useState<ProjectSupervisorOption[]>([]);
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
  const [initialSupervisorIds, setInitialSupervisorIds] = useState<string[]>([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);
  const [attachmentLinks, setAttachmentLinks] = useState<string[]>([]);
  const [attachmentInput, setAttachmentInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const parsed = extractTicketMedia(ticket.description);
    const initialTypes = ticket.detectedTypes?.length
      ? unique(ticket.detectedTypes as TicketType[])
      : [ticket.type as TicketType].filter(Boolean);
    const existingSupervisorIds = unique(
      ticket.assignedSupervisorIds?.length
        ? ticket.assignedSupervisorIds
        : ticket.assignedSupervisorId
          ? [ticket.assignedSupervisorId]
          : [],
    );

    setStatus(normalizeStatus(ticket.status));
    setPriority(String(ticket.priority));
    setDescription(parsed.cleanText);
    setTypes(initialTypes);
    setSubTypeIds(unique(ticket.detectedSubTypeIds ?? []));
    setSupervisorIds(existingSupervisorIds);
    setInitialSupervisorIds(existingSupervisorIds);
    setAttachmentLinks(unique(parsed.items.map(item => item.url)));
    setAttachmentInput('');
    setFiles([]);
  }, [open, ticket]);

  useEffect(() => {
    if (!open || !ticket.projectId) return;
    let active = true;
    setSupervisorsLoading(true);

    ticketEditApi.getProjectSupervisors(ticket.projectId)
      .then(items => {
        if (active) setSupervisors(items);
      })
      .catch(() => {
        if (active) {
          setSupervisors([]);
          toast.error(t.supervisorsFailed);
        }
      })
      .finally(() => {
        if (active) setSupervisorsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, ticket.projectId]);

  const selectedSupervisorNames = useMemo(
    () => supervisors.filter(item => supervisorIds.includes(item.uid)),
    [supervisors, supervisorIds],
  );

  const addAttachmentLink = () => {
    const value = attachmentInput.trim();
    const item = classifyTicketMedia(value);
    if (!item || !isDisplayableTicketMedia(item) || !isSafeMediaLink(item.url)) {
      toast.error(t.invalidMediaLink);
      return;
    }
    if (attachmentLinks.includes(item.url)) {
      toast.error(t.duplicateMediaLink);
      return;
    }
    setAttachmentLinks(current => [...current, item.url]);
    setAttachmentInput('');
  };

  const handleFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const incoming = Array.from(selected);
    if (files.length + incoming.length > MAX_FILES) {
      toast.error(t.tooManyFiles);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const invalid = incoming.some(file => !ALLOWED_FILE_TYPES.has(file.type) || file.size > MAX_FILE_SIZE || file.size <= 0);
    if (invalid) {
      toast.error(t.invalidFile);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFiles(current => [...current, ...incoming]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSupervisor = (uid: string) => {
    setSupervisorIds(current => current.includes(uid) ? current.filter(id => id !== uid) : [...current, uid]);
  };

  const save = async () => {
    if (!types.length) return;
    setSaving(true);

    try {
      let uploadedLinks: string[] = [];
      if (files.length) {
        setUploading(true);
        try {
          const uploaded = await ticketEditApi.uploadAttachments(ticket.id, files);
          uploadedLinks = uploaded.map(item => new URL(item.url, window.location.origin).toString());
        } catch {
          toast.error(t.uploadFailed);
          return;
        } finally {
          setUploading(false);
        }
      }

      const finalLinks = unique([...attachmentLinks, ...uploadedLinks]);
      const finalDescription = [description.trim(), ...finalLinks].filter(Boolean).join('\n');
      const selected = supervisors.filter(item => supervisorIds.includes(item.uid));
      const primarySupervisor = selected.find(item => item.uid === supervisorIds[0]) ?? selected[0];
      const supervisorsChanged = !sameStringSet(initialSupervisorIds, supervisorIds);

      await ticketsApi.update(ticket.id, {
        status,
        priority: Number.isFinite(Number(priority)) ? Number(priority) : priority,
        description: finalDescription,
        type: types[0],
        detectedTypes: types,
        detectedSubTypeIds: subTypeIds,
        ...(supervisorsChanged ? {
          assignedSupervisorIds: supervisorIds,
          assigneeName: primarySupervisor?.displayName ?? null,
        } : {}),
      });

      invalidateTicketCache();
      toast.success(t.saved);
      onOpenChange(false);
      await onSaved();
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!saving) onOpenChange(nextOpen); }}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100vw-1.25rem)] max-w-[calc(100vw-1.25rem)] overflow-x-hidden overflow-y-auto rounded-3xl p-0 sm:max-w-2xl"
        dir="rtl"
      >
        <DialogHeader className="sticky top-0 z-20 min-w-0 max-w-full border-b border-border/60 bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
          <DialogTitle className="min-w-0 break-words text-right text-lg font-black">{t.title}</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden px-4 py-4 sm:px-6">
          <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 max-w-full space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">{t.status}</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full min-w-0 max-w-full rounded-xl"><SelectValue placeholder={t.selectStatus} /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(value => <SelectItem key={value} value={value}>{detailText.statuses[value]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 max-w-full space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">{t.priority}</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full min-w-0 max-w-full rounded-xl"><SelectValue placeholder={t.selectPriority} /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(value => <SelectItem key={value} value={value}>{detailText.priorities[value]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-w-0 max-w-full space-y-1.5 overflow-hidden">
            <label className="text-xs font-bold text-muted-foreground">{t.description}</label>
            <Textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder={t.descriptionPlaceholder}
              className="min-h-36 w-full min-w-0 max-w-full resize-y overflow-x-hidden whitespace-pre-wrap break-words rounded-xl text-right leading-6 [overflow-wrap:anywhere]"
            />
          </div>

          <div className="min-w-0 max-w-full rounded-2xl border border-border/60 p-3 sm:p-4">
            <TypesSelector
              label={t.typeSelectorLabel}
              value={types}
              onChange={setTypes}
              min={1}
              showSubTypes
              selectedSubTypeIds={subTypeIds}
              onSubTypeChange={setSubTypeIds}
              className="min-w-0 max-w-full [&>div]:min-w-0 [&>div]:max-w-full [&_button]:max-w-full"
            />
            <p className="mt-2 break-words text-[11px] leading-5 text-muted-foreground">{t.classificationHint}</p>
          </div>

          <div className="min-w-0 max-w-full space-y-2 overflow-hidden rounded-2xl border border-border/60 p-3 sm:p-4">
            <p className="text-xs font-bold text-muted-foreground">{t.supervisors}</p>
            {supervisorsLoading ? (
              <p className="text-xs text-muted-foreground">{t.supervisorsLoading}</p>
            ) : supervisors.length ? (
              <div className="grid min-w-0 max-w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {supervisors.map(supervisor => {
                  const selected = supervisorIds.includes(supervisor.uid);
                  return (
                    <button
                      key={supervisor.uid}
                      type="button"
                      onClick={() => toggleSupervisor(supervisor.uid)}
                      className={cn(
                        'flex min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-right transition-colors',
                        selected ? 'border-primary/35 bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted/50',
                      )}
                    >
                      <span className="min-w-0 flex-1 break-words text-sm font-bold [overflow-wrap:anywhere]">{supervisor.displayName}</span>
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t.supervisorsEmpty}</p>
            )}
            {selectedSupervisorNames.length > 0 && (
              <div className="flex min-w-0 max-w-full flex-wrap gap-1.5 overflow-hidden pt-1">
                {selectedSupervisorNames.map(supervisor => (
                  <span key={supervisor.uid} className="max-w-full break-words rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary [overflow-wrap:anywhere]">
                    {supervisor.displayName}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-2xl border border-border/60 p-3 sm:p-4">
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-primary" />
              <p className="min-w-0 break-words text-xs font-bold text-muted-foreground">{t.mediaLinks}</p>
            </div>
            <div className="flex w-full min-w-0 max-w-full flex-col gap-2 sm:flex-row">
              <Input
                value={attachmentInput}
                onChange={event => setAttachmentInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addAttachmentLink();
                  }
                }}
                placeholder={t.mediaLinkPlaceholder}
                dir="ltr"
                className="w-full min-w-0 max-w-full flex-1 rounded-xl sm:w-0"
              />
              <Button type="button" variant="outline" className="max-w-full shrink-0 rounded-xl" onClick={addAttachmentLink}>
                <Link2 className="me-1.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{t.addLink}</span>
              </Button>
            </div>
            <p className="break-words text-[11px] leading-5 text-muted-foreground">{t.mediaLinkHint}</p>

            {attachmentLinks.length > 0 && (
              <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
                {attachmentLinks.map(link => (
                  <div key={link} className="flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-xl bg-muted/40 px-3 py-2">
                    <span className="min-w-0 flex-1 whitespace-normal break-all text-xs leading-5 [overflow-wrap:anywhere]" dir="ltr">{link}</span>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t.removeLink}
                      title={t.removeLink}
                      onClick={() => setAttachmentLinks(current => current.filter(item => item !== link))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-2xl border border-border/60 p-3 sm:p-4">
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0 text-primary" />
              <p className="min-w-0 break-words text-xs font-bold text-muted-foreground">{t.uploadFiles}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/ogg"
              onChange={event => handleFiles(event.target.files)}
            />
            <Button type="button" variant="outline" className="w-full min-w-0 max-w-full rounded-xl border-dashed" onClick={() => fileInputRef.current?.click()}>
              <Upload className="me-2 h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{t.chooseFiles}</span>
            </Button>
            <p className="break-words text-[11px] leading-5 text-muted-foreground">{t.uploadHint}</p>

            {files.length > 0 && (
              <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
                <p className="text-[11px] font-bold text-muted-foreground">{t.selectedFiles}</p>
                {files.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-xl bg-muted/40 px-3 py-2">
                    <span className="min-w-0 flex-1 break-all text-xs font-medium leading-5 [overflow-wrap:anywhere]">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground" dir="ltr">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t.removeFile}
                      title={t.removeFile}
                      onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 z-20 min-w-0 max-w-full border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
          <Button onClick={save} disabled={saving || !types.length} className="w-full min-w-0 max-w-full rounded-xl sm:w-auto">
            {uploading ? t.uploading : saving ? t.saving : t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
