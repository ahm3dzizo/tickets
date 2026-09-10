import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { translateTechTaxonomy } from '@/i18n/techTaxonomy';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Upload } from 'lucide-react';
import { toast } from 'sonner';
import './tech.css';

const LANGUAGES = [
  { code: 'ar', label: '🇸🇦 عربي' },
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'ur', label: 'اردو' },
] as const;

const CLOTHING_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SHOE_SIZES = Array.from({ length: 10 }, (_, i) => String(38 + i));
const MAX_ID_PHOTO_BYTES = 4.5 * 1024 * 1024;

const PIN_HINT: Record<TechLang, string> = {
  ar: 'اختر رمز PIN جديد مكوّن من 6 أرقام. سيحل محل الرمز المؤقت.',
  en: 'Choose a new 6-digit PIN. It will replace the temporary PIN.',
  hi: 'नया 6 अंकों का PIN चुनें। यह अस्थायी PIN को बदल देगा।',
  ur: 'نیا 6 ہندسوں کا PIN منتخب کریں۔ یہ عارضی PIN کی جگہ لے گا۔',
};

const CONFIRM_PIN_LABEL: Record<TechLang, string> = {
  ar: 'تأكيد PIN الجديد',
  en: 'Confirm new PIN',
  hi: 'नए PIN की पुष्टि करें',
  ur: 'نئے PIN کی تصدیق کریں',
};

const SPECIALTY_REQUIRED: Record<TechLang, string> = {
  ar: 'لم يتم تعيين تخصص لك بعد. تواصل مع الإدارة لإضافة التخصص ثم أعد المحاولة.',
  en: 'No specialty has been assigned yet. Ask management to assign one, then try again.',
  hi: 'अभी कोई विशेषज्ञता निर्धारित नहीं की गई है। प्रबंधन से विशेषज्ञता निर्धारित करवाकर फिर प्रयास करें।',
  ur: 'ابھی کوئی تخصص مقرر نہیں کیا گیا۔ انتظامیہ سے تخصص مقرر کروائیں پھر دوبارہ کوشش کریں۔',
};

export default function TechSetup() {
  const { token, techProfile, setProfile } = useTechAuth() as any;
  const navigate = useNavigate();

  const storedLanguage = (() => {
    try { return (localStorage.getItem('tech_language') as TechLang) || 'ar'; }
    catch { return 'ar' as TechLang; }
  })();

  const [lang, setLang] = useState<TechLang>(storedLanguage);
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [formData, setFormData] = useState({
    fullName: techProfile?.name || '',
    idNumber: '',
    employeeId: techProfile?.employeeId || '',
    experienceLevel: techProfile?.experienceLevel || '',
    clothingSize: techProfile?.clothingSize || CLOTHING_SIZES[2],
    shoeSize: techProfile?.shoeSize || SHOE_SIZES[4],
    preferredLang: storedLanguage,
    newPin: '',
    confirmPin: '',
  });

  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!token) navigate('/tech/login', { replace: true });
  }, [token, navigate]);

  useEffect(() => {
    if (!techProfile) return;
    setFormData(prev => ({
      ...prev,
      fullName: prev.fullName || techProfile.name || '',
      employeeId: prev.employeeId || techProfile.employeeId || '',
      experienceLevel: prev.experienceLevel || techProfile.experienceLevel || '',
      clothingSize: techProfile.clothingSize || prev.clothingSize,
      shoeSize: techProfile.shoeSize || prev.shoeSize,
    }));
  }, [techProfile]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(lang === 'ar' ? 'استخدم صورة JPG أو PNG أو WEBP فقط' : 'Use a JPG, PNG, or WEBP image');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_ID_PHOTO_BYTES) {
      toast.error(lang === 'ar' ? 'حجم صورة الهوية كبير جداً' : 'The ID image is too large');
      e.target.value = '';
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setIdPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName.trim() || !formData.idNumber.trim() || !formData.employeeId.trim()) {
      toast.error(t(lang, 'fillMandatory'));
      return;
    }
    if (!techProfile?.specialty) {
      toast.error(SPECIALTY_REQUIRED[lang]);
      return;
    }
    if (!idPhoto) {
      toast.error(t(lang, 'idPhotoRequired'));
      return;
    }
    if (!/^\d{6}$/.test(formData.newPin)) {
      toast.error(PIN_HINT[lang]);
      return;
    }
    if (formData.newPin !== formData.confirmPin) {
      toast.error(lang === 'ar' ? 'رمزا PIN غير متطابقين' : 'PIN values do not match');
      return;
    }
    if (!token) {
      navigate('/tech/login', { replace: true });
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      payload.append('name', formData.fullName.trim());
      payload.append('idNumber', formData.idNumber.trim());
      payload.append('employeeId', formData.employeeId.trim());
      if (formData.experienceLevel) payload.append('experienceLevel', String(formData.experienceLevel));
      payload.append('clothingSize', formData.clothingSize);
      payload.append('shoeSize', formData.shoeSize);
      payload.append('language', formData.preferredLang);
      payload.append('newPassword', formData.newPin);
      payload.append('idPhoto', idPhoto, idPhoto.name);

      const res = await fetch('/api/tech/profile/complete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t(lang, 'profileCompletedError'));
      }

      const data = await res.json();
      setProfile(data.profile ?? data);
      try {
        localStorage.setItem('tech_language', formData.preferredLang);
        localStorage.setItem('tech_profile', JSON.stringify(data.profile ?? data));
      } catch {}
      toast.success(t(lang, 'profileCompletedSuccess'));
      navigate('/tech', { replace: true });
    } catch (err: any) {
      toast.error(lang === 'ar' && err?.message ? err.message : t(lang, 'profileCompletedError'));
    } finally {
      setLoading(false);
    }
  };

  const isRtl = lang === 'ar' || lang === 'ur';

  return (
    <div className="tech-app" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="tech-container slide-up pb-8">
        <div className="flex justify-center gap-2 mb-6 mt-4">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`lang-btn ${lang === l.code ? 'active' : ''}`}
              onClick={() => {
                const newLang = l.code as TechLang;
                setLang(newLang);
                try { localStorage.setItem('tech_language', newLang); } catch {}
                setFormData(prev => ({ ...prev, preferredLang: newLang }));
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t(lang, 'profileSetup')}</h1>
          <p className="text-[var(--tech-text-muted)] text-sm mt-1">{t(lang, 'setupSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="tech-glass p-5 rounded-2xl space-y-4">
            <div>
              <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                {t(lang, 'fullName')}
              </label>
              <input
                type="text"
                className="tech-input"
                value={formData.fullName}
                onChange={e => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                autoComplete="name"
                maxLength={120}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                  {t(lang, 'idNumber')}
                </label>
                <input
                  type="text"
                  className="tech-input"
                  value={formData.idNumber}
                  onChange={e => setFormData(prev => ({ ...prev, idNumber: e.target.value }))}
                  maxLength={80}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                  {t(lang, 'employeeId')}
                </label>
                <input
                  type="text"
                  className="tech-input"
                  value={formData.employeeId}
                  onChange={e => setFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                  maxLength={80}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                {t(lang, 'experienceLevel')}
              </label>
              <input
                type="number"
                min="0"
                max="50"
                className="tech-input"
                value={formData.experienceLevel}
                onChange={e => setFormData(prev => ({ ...prev, experienceLevel: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                {t(lang, 'specialty')}
              </label>
              {techProfile?.specialty ? (
                <div className="tech-input flex items-center min-h-12 opacity-80 cursor-not-allowed">
                  {translateTechTaxonomy(techProfile.specialty, lang)}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{SPECIALTY_REQUIRED[lang]}</span>
                </div>
              )}
              <div className="text-[11px] text-[var(--tech-text-muted)] mt-1 px-1">
                {lang === 'ar' ? 'التخصص يتم تحديده من الإدارة فقط' : 'Specialty is assigned by management only'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                  {t(lang, 'clothingSize')}
                </label>
                <select
                  className="tech-input appearance-none"
                  value={formData.clothingSize}
                  onChange={e => setFormData(prev => ({ ...prev, clothingSize: e.target.value }))}
                >
                  {CLOTHING_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                  {t(lang, 'shoeSize')}
                </label>
                <select
                  className="tech-input appearance-none"
                  value={formData.shoeSize}
                  onChange={e => setFormData(prev => ({ ...prev, shoeSize: e.target.value }))}
                >
                  {SHOE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                {t(lang, 'idPhoto')}
              </label>
              <div className="border-2 border-dashed border-[var(--tech-border)] rounded-xl p-4 text-center">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="hidden"
                  id="id-photo-upload"
                />
                <label htmlFor="id-photo-upload" className="cursor-pointer flex flex-col items-center">
                  {photoPreview ? (
                    <img src={photoPreview} alt={t(lang, 'idPhoto')} className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-[var(--tech-text-muted)] mb-2" />
                  )}
                  <span className="text-sm text-[var(--tech-accent-blue)] font-medium">
                    {t(lang, 'idPhoto')}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="tech-glass p-5 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Lock className="w-4 h-4" />
              {t(lang, 'password')}
            </div>
            <p className="text-xs text-[var(--tech-text-muted)]">{PIN_HINT[lang]}</p>

            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="new-password"
                className="tech-input"
                style={{ paddingInlineEnd: 44 }}
                value={formData.newPin}
                onChange={e => setFormData(prev => ({ ...prev, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                placeholder="••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin(v => !v)}
                className="absolute top-1/2 -translate-y-1/2 end-3 text-[var(--tech-text-muted)]"
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div>
              <label className="block text-xs text-[var(--tech-text-muted)] mb-1 px-1">
                {CONFIRM_PIN_LABEL[lang]}
              </label>
              <div className="relative">
                <input
                  type={showPinConfirm ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="new-password"
                  className="tech-input"
                  style={{ paddingInlineEnd: 44 }}
                  value={formData.confirmPin}
                  onChange={e => setFormData(prev => ({ ...prev, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  placeholder="••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPinConfirm(v => !v)}
                  className="absolute top-1/2 -translate-y-1/2 end-3 text-[var(--tech-text-muted)]"
                  aria-label={showPinConfirm ? 'Hide PIN' : 'Show PIN'}
                >
                  {showPinConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !techProfile?.specialty}
            className="tech-btn tech-btn-success mt-6 text-lg"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : t(lang, 'saveProfile')}
          </button>
        </form>
      </div>
    </div>
  );
}
