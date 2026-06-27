// src/components/tickets/UnifiedImportModal.tsx
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown, FileUp, Loader2 } from 'lucide-react';
import { Project, Client } from '@/types';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';

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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [closeMissingTickets, setCloseMissingTickets] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const hasClientsInProject = selectedProjectId && clients.some(c => c.projectId === selectedProjectId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[600px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right">استيراد تذاكر صيانة</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div>
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase">١. اختر المشروع</Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12 mt-1">
                  <ChevronDown className="w-4 h-4 opacity-50" />
                  <span>{selectedProject?.name || 'اختر المشروع'}</span>
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border w-full">
                {projects.map(p => (
                  <DropdownMenuItem key={p.id} onClick={() => setSelectedProjectId(p.id)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <div className="flex items-center gap-3 mt-3 bg-red-500/10 border border-red-500/30 p-3 rounded-xl justify-end">
              <Label htmlFor="closeMissing" className="text-red-400 font-bold text-xs cursor-pointer text-right flex-1">
                إغلاق التذاكر غير الموجودة في هذا الملف (اعتبار هذا الملف هو الحالة النهائية للنظام)
              </Label>
              <input 
                type="checkbox" 
                id="closeMissing" 
                checked={closeMissingTickets}
                onChange={e => setCloseMissingTickets(e.target.checked)}
                className="w-5 h-5 rounded border-red-500/50 bg-transparent text-red-500 focus:ring-red-500/20 shrink-0 cursor-pointer"
              />
            </div>
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

              <div className="mb-3">
                <label className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-blue-500/40 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 cursor-pointer transition-all ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2 text-blue-400">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                    <span className="text-sm font-bold">استيراد الملف</span>
                  </div>
                  <span className="text-xs text-slate-500 mt-1">معالجة سريعة وآمنة على السيرفر</span>
                  <input
                    type="file"
                    accept=".xlsx,.xlsm,.xls,.csv"
                    className="hidden"
                    disabled={!selectedProjectId || !hasClientsInProject || loading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !selectedProjectId) return;
                      e.target.value = '';
                      setLoading(true);
                      setProgress(0.1);
                      try {
                        const result = await ticketsApi.importExcel(file, selectedProjectId, closeMissingTickets, (p) => setProgress(p));
                        setProgress(1);
                        const parts = [];
                        if (result.skippedByDateFilter > 0) parts.push(`⏳ تم تجاهل ${result.skippedByDateFilter} تذكرة قديمة (مغلقة مسبقاً)`);
                        if (result.closedMissing > 0) parts.push(`🔒 إغلاق ${result.closedMissing} تذكرة غير موجودة بالملف`);
                        if (result.added > 0) parts.push(`✅ إضافة ${result.added} (مصنف: ${result.classified ?? 0}، غير مصنف: ${result.unclassified ?? 0})`);
                        if (result.updated > 0) parts.push(`🔄 تحديث ${result.updated}`);
                        if (result.skippedInDB > 0) parts.push(`⏭ موجود بدون تغيير: ${result.skippedInDB}`);
                        if ((result.skippedInFile ?? 0) > 0) parts.push(`🔁 مكرر في الملف: ${result.skippedInFile}`);
                        if (result.failed > 0) parts.push(`❌ فشل: ${result.failed}`);
                        toast.success(parts.join('\n'));
                        setOpen(false);
                        setSelectedProjectId('');
                        onImportSuccess();
                      } catch (err: any) {
                        toast.error('فشل الاستيراد: ' + err.message);
                      } finally {
                        setLoading(false);
                        setProgress(0);
                      }
                    }}
                  />
                </label>
              </div>
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
            <p>• <span className="text-blue-400">التصنيف الذكي</span> — يتم تصنيف التذاكر التي لا تحتوي على نوع صيانة بواسطة الذكاء الاصطناعي لاحقاً.</p>
            <p>• <span className="text-blue-400">ربط العميل</span> — من خلال مطابقة رقم الفيلا تلقائياً بقاعدة بيانات العملاء.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}