import React, { useEffect, useState } from 'react';
import {
  Loader2,
  Mail,
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Briefcase,
  Phone,
  CreditCard,
  Shirt,
  Footprints,
  Camera,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const roleLabels: Record<string, string> = {
  admin: 'مدير النظام',
  engineer: 'مهندس مشروع',
  supervisor: 'مشرف',
  client: 'عميل',
};

const specialtyLabels: Record<string, string> = {
  mechanics: 'ميكانيكا',
  electricity: 'كهرباء',
  general: 'عام',
};

const clothingSizes = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
];

const shoeSizes = [
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
];

interface ProfileCompletionModalProps {
  open: boolean;
  isFirstLogin?: boolean;

  pendingUser?: {
    displayName?: string;
    role?: string;
    specialty?: string;
    phoneNumber?: string;
    employeeId?: string;
    idNumber?: string;
    clothingSize?: string;
    shoeSize?: string;
    photoURL?: string;
  } | null;

  onComplete: (data: {
    displayName: string;
    phoneNumber: string;
    employeeId: string;
    idNumber: string;
    clothingSize: string;
    shoeSize: string;
    email?: string;
    photo?: File | null;
  }) => Promise<void>;
}

export function ProfileCompletionModal({
  open,
  isFirstLogin = false,
  pendingUser,
  onComplete,
}: ProfileCompletionModalProps) {
  const [loading, setLoading] = useState(false);

  const [displayName, setDisplayName] = useState(
    pendingUser?.displayName || ''
  );

  const [phoneNumber, setPhoneNumber] = useState(
    pendingUser?.phoneNumber || ''
  );

  const [employeeId, setEmployeeId] = useState(
    pendingUser?.employeeId || ''
  );

  const [idNumber, setIdNumber] = useState(
    pendingUser?.idNumber || ''
  );

  const [clothingSize, setClothingSize] = useState(
    pendingUser?.clothingSize || ''
  );

  const [shoeSize, setShoeSize] = useState(
    pendingUser?.shoeSize || ''
  );

  const [email, setEmail] = useState('');

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] =
    useState<string | null>(
      pendingUser?.photoURL || null
    );



  useEffect(() => {
    if (!pendingUser) return;

    setDisplayName(pendingUser.displayName || '');
    setPhoneNumber(pendingUser.phoneNumber || '');
    setEmployeeId(pendingUser.employeeId || '');
    setIdNumber(pendingUser.idNumber || '');
    setClothingSize(pendingUser.clothingSize || '');
    setShoeSize(pendingUser.shoeSize || '');
    setPhotoPreview(pendingUser.photoURL || null);
  }, [pendingUser]);

  if (!open) return null;

  const role = pendingUser?.role || 'engineer';
  const specialty = pendingUser?.specialty || '';

  const roleLabel = roleLabels[role] ?? role;
  const spLabel = specialtyLabels[specialty] ?? specialty;

  const handlePhotoChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (
      ![
        'image/jpeg',
        'image/png',
        'image/webp',
      ].includes(file.type)
    ) {
      toast.error(
        'يسمح فقط بصور JPG أو PNG أو WEBP'
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        'حجم الصورة يجب ألا يتجاوز 5 ميجابايت'
      );
      return;
    }

    setPhoto(file);
    setPhotoPreview(
      URL.createObjectURL(file)
    );
  };

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!displayName.trim()) {
      toast.error('يرجى إدخال الاسم الكامل');
      return;
    }

    if (!phoneNumber.trim()) {
      toast.error('يرجى إدخال رقم الهاتف');
      return;
    }

    if (!employeeId.trim()) {
      toast.error('يرجى إدخال الرقم الوظيفي');
      return;
    }

    if (!idNumber.trim()) {
      toast.error('يرجى إدخال رقم الهوية');
      return;
    }

    if (!clothingSize) {
      toast.error('يرجى اختيار مقاس التيشيرت');
      return;
    }

    if (!shoeSize) {
      toast.error('يرجى اختيار مقاس الجزمة');
      return;
    }

    if (
      email.trim() &&
      !email.includes('@')
    ) {
      toast.error(
        'يرجى إدخال بريد إلكتروني صحيح'
      );
      return;
    }

    setLoading(true);

    try {
      await onComplete({
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        employeeId: employeeId.trim(),
        idNumber: idNumber.trim(),
        clothingSize,
        shoeSize,
        email: email.trim()
          ? email.trim().toLowerCase()
          : undefined,
        photo,
      });

      toast.success(
        'مرحباً بك! تم تفعيل حسابك بنجاح'
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          'حدث خطأ أثناء حفظ البيانات'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300 my-6">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6 space-y-3">
          <div className="relative">
            <div className="w-16 h-16 rounded-[1.5rem] bg-white dark:bg-card border border-border shadow-xl p-2.5">
              <img
                src="/icon.png"
                alt="Tickets"
                className="w-full h-full object-contain rounded-xl"
              />
            </div>

            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </div>
          </div>

          <div>
            <h1 className="text-xl font-black text-foreground">
              أكمل تسجيلك
            </h1>

            <p className="text-muted-foreground text-sm mt-0.5">
              أدخل بياناتك لإتمام تفعيل الحساب
            </p>
          </div>
        </div>

        {/* Role */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2">
            <Briefcase className="w-3.5 h-3.5 text-primary" />

            <span className="text-sm font-bold text-primary">
              {roleLabel}
            </span>

            {spLabel && (
              <>
                <span className="text-primary/40">
                  ·
                </span>

                <span className="text-sm text-primary/70">
                  {spLabel}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-3xl shadow-2xl shadow-black/10 p-6">

          <form
            onSubmit={handleSubmit}
            autoComplete="off"
            className="space-y-4"
          >

            {/* Photo */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground block text-right px-1">
                الصورة الشخصية
                <span className="font-normal mr-1 opacity-60">
                  (اختياري)
                </span>
              </label>

              <label className="relative flex flex-col items-center justify-center w-28 h-28 mx-auto rounded-2xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors overflow-hidden">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="الصورة الشخصية"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <Camera className="w-7 h-7 text-muted-foreground mb-2" />

                    <span className="text-[10px] text-muted-foreground">
                      اختر صورة
                    </span>
                  </>
                )}

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </label>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground block text-right px-1">
                الاسم الكامل
                <span className="text-red-400 mr-1">
                  *
                </span>
              </label>

              <div className="relative group">
                <Input
                  placeholder="محمد أحمد"
                  value={displayName}
                  onChange={e =>
                    setDisplayName(e.target.value)
                  }
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                  required
                />

                <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground block text-right px-1">
                رقم الهاتف
                <span className="text-red-400 mr-1">
                  *
                </span>
              </label>

              <div className="relative group">
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="05xxxxxxxx"
                  value={phoneNumber}
                  onChange={e =>
                    setPhoneNumber(e.target.value)
                  }
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                  required
                />

                <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* Employee ID */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground block text-right px-1">
                الرقم الوظيفي
                <span className="text-red-400 mr-1">
                  *
                </span>
              </label>

              <div className="relative">
                <Input
                  placeholder="رقم الموظف"
                  value={employeeId}
                  onChange={e =>
                    setEmployeeId(e.target.value)
                  }
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                  required
                />

                <CreditCard className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* ID Number */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground block text-right px-1">
                رقم الهوية
                <span className="text-red-400 mr-1">
                  *
                </span>
              </label>

              <div className="relative">
                <Input
                  inputMode="numeric"
                  placeholder="رقم الهوية"
                  value={idNumber}
                  onChange={e =>
                    setIdNumber(e.target.value)
                  }
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                  required
                />

                <CreditCard className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* Sizes */}
            <div className="grid grid-cols-2 gap-3">

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-muted-foreground block text-right px-1">
                  مقاس التيشيرت
                  <span className="text-red-400 mr-1">
                    *
                  </span>
                </label>

                <div className="relative">
                  <select
                    value={clothingSize}
                    onChange={e =>
                      setClothingSize(e.target.value)
                    }
                    required
                    className="w-full h-12 rounded-2xl pr-10 pl-3 text-right bg-muted/50 border border-transparent focus:border-primary/40 outline-none appearance-none"
                  >
                    <option value="">
                      اختر
                    </option>

                    {clothingSizes.map(size => (
                      <option
                        key={size}
                        value={size}
                      >
                        {size}
                      </option>
                    ))}
                  </select>

                  <Shirt className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-muted-foreground block text-right px-1">
                  مقاس الجزمة
                  <span className="text-red-400 mr-1">
                    *
                  </span>
                </label>

                <div className="relative">
                  <select
                    value={shoeSize}
                    onChange={e =>
                      setShoeSize(e.target.value)
                    }
                    required
                    className="w-full h-12 rounded-2xl pr-10 pl-3 text-right bg-muted/50 border border-transparent focus:border-primary/40 outline-none appearance-none"
                  >
                    <option value="">
                      اختر
                    </option>

                    {shoeSizes.map(size => (
                      <option
                        key={size}
                        value={size}
                      >
                        {size}
                      </option>
                    ))}
                  </select>

                  <Footprints className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground block text-right px-1">
                البريد الإلكتروني
                <span className="font-normal mr-1 opacity-60">
                  (اختياري)
                </span>
              </label>

              <div className="relative group">
                <Input
                  type="email"
                  autoComplete="off"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e =>
                    setEmail(e.target.value)
                  }
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                />

                <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black shadow-lg shadow-primary/25 text-base transition-all active:scale-[0.98] mt-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'تفعيل الحساب والدخول'
              )}
            </Button>

          </form>
        </div>
      </div>
    </div>
  );
}
