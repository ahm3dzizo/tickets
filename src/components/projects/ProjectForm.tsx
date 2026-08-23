import React, { useState, useEffect } from 'react';
import {
  Plus,
  Briefcase,
  MapPin,
  Hash,
  Users,
  Loader2,
  Pencil,
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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usersApi, projectsApi } from '@/lib/api';
import { User, Project } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ProjectFormProps {
  trigger?: React.ReactNode;
  nativeButton?: boolean;
  project?: Project;
  onSuccess?: () => void;
}

export function ProjectForm({
  trigger,
  nativeButton,
  project,
  onSuccess,
}: ProjectFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [selectedEngineers, setSelectedEngineers] = useState<string[]>([]);
  const [engineers, setEngineers] = useState<User[]>([]);

  const isEdit = !!project;

  useEffect(() => {
    usersApi
      .getAll()
      .then(all =>
        setEngineers(all.filter((u: User) => u.role === 'engineer'))
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && project) {
      setName(project.name || '');
      setLocation(project.location || '');
      setAbbreviation(project.abbreviation || '');
      setGoogleMapsUrl(project.googleMapsUrl || '');
      setSelectedEngineers(project.engineerIds || []);
    }

    if (open && !project) {
      resetForm();
    }
  }, [open, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !location.trim() || !abbreviation.trim()) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);

    try {
      if (isEdit && project) {
        await projectsApi.update(project.id, {
          name: name.trim(),
          location: location.trim(),
          abbreviation: abbreviation.trim(),
          googleMapsUrl: googleMapsUrl.trim(),
          engineerIds: selectedEngineers,
        });

        toast.success('تم تعديل المشروع بنجاح');
      } else {
        await projectsApi.create({
          name: name.trim(),
          location: location.trim(),
          abbreviation: abbreviation.trim(),
          googleMapsUrl: googleMapsUrl.trim(),
          engineerIds: selectedEngineers,
          supervisorIds: [],
          createdAt: new Date().toISOString(),
        });

        toast.success('تم إنشاء المشروع بنجاح');
      }

      setOpen(false);
      onSuccess?.();

      if (!isEdit) {
        resetForm();
      }
    } catch (error) {
      console.error('Project save error:', error);

      const message =
        error instanceof Error
          ? error.message
          : isEdit
            ? 'فشل تعديل المشروع'
            : 'فشل إنشاء المشروع';

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setLocation('');
    setAbbreviation('');
    setGoogleMapsUrl('');
    setSelectedEngineers([]);
  };

  const toggleEngineer = (uid: string) => {
    setSelectedEngineers(prev =>
      prev.includes(uid)
        ? prev.filter(id => id !== uid)
        : [...prev, uid]
    );
  };

  const defaultTrigger = (
    <Button
      className={
        isEdit
          ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-2 rounded-xl'
          : 'bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-12 px-6 font-bold shadow-lg shadow-blue-500/20'
      }
    >
      {isEdit ? (
        <>
          <Pencil className="w-4 h-4" />
          تعديل
        </>
      ) : (
        <>
          <Plus className="w-5 h-5" />
          مشروع جديد
        </>
      )}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        nativeButton={nativeButton ?? true}
        render={
          React.isValidElement(trigger)
            ? trigger
            : defaultTrigger
        }
      />

      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[500px] rounded-3xl shadow-2xl shadow-black/40">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right">
            {isEdit ? 'تعديل المشروع' : 'إضافة مشروع جديد'}
          </DialogTitle>

          <DialogDescription className="text-slate-500 text-right">
            {isEdit
              ? 'قم بتعديل بيانات المشروع والمهندسين المسؤولين.'
              : 'أدخل تفاصيل المشروع الجديد والمهندسين المسؤولين.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              اسم المشروع
            </Label>

            <div className="relative">
              <Input
                placeholder="مثال: مجمع النرجس السكني"
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
              <Briefcase className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
                الموقع
              </Label>

              <div className="relative">
                <Input
                  placeholder="الرياض، النرجس"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  required
                />
                <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
                الاختصار
              </Label>

              <div className="relative">
                <Input
                  placeholder="NAR-01"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                  value={abbreviation}
                  onChange={e => setAbbreviation(e.target.value)}
                  required
                />
                <Hash className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              موقع مكتب المشروع
            </Label>

            <div className="relative">
              <Input
                placeholder="24.7136, 46.6753 أو رابط Google Maps"
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono text-xs"
                value={googleMapsUrl}
                onChange={e => setGoogleMapsUrl(e.target.value)}
              />
              <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              المهندسين المسؤولين
            </Label>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12"
                  />
                }
              >
                <Users className="w-3 h-3 opacity-50" />
                <span>
                  {selectedEngineers.length > 0
                    ? `تم اختيار ${selectedEngineers.length}`
                    : 'اختر المهندسين'}
                </span>
              </DropdownMenuTrigger>

              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64 max-h-60 overflow-y-auto">
                {engineers.map(eng => (
                  <DropdownMenuItem
                    key={eng.uid}
                    className={cn(
                      'hover:bg-white/5 cursor-pointer text-right justify-end gap-2',
                      selectedEngineers.includes(eng.uid) &&
                        'bg-blue-500/10 text-blue-400'
                    )}
                    onClick={e => {
                      e.preventDefault();
                      toggleEngineer(eng.uid);
                    }}
                  >
                    {eng.displayName}

                    {selectedEngineers.includes(eng.uid) && (
                      <Plus className="w-3 h-3 rotate-45" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <DialogFooter className="pt-4 gap-3">
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl h-12 font-bold shadow-lg shadow-blue-500/20 flex-1"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isEdit ? (
                'حفظ التعديلات'
              ) : (
                'إنشاء المشروع'
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="text-slate-500 hover:text-white rounded-xl h-12"
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
