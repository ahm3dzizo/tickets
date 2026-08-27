import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { translateTechTaxonomy } from '@/i18n/techTaxonomy';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import './tech.css';

const LANGUAGES = [
  { code: 'ar', label: '🇸🇦 عربي' },
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'ur', label: 'اردو' },
];

const SPECIALTIES = ['plumbing', 'electrical', 'hvac', 'carpentry', 'general'];
const CLOTHING_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SHOE_SIZES = Array.from({ length: 10 }, (_, i) => String(38 + i)); // 38-47

export default function TechSetup() {
  const { token, setProfile } = useTechAuth();
  const navigate = useNavigate();
  
  const [lang, setLang] = useState<TechLang>(() => {
    return (localStorage.getItem('tech_language') as TechLang) || 'ar';
  });
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    idNumber: '',
    employeeId: '',
    experienceLevel: '',
    specialty: SPECIALTIES[0],
    clothingSize: CLOTHING_SIZES[2],
    shoeSize: SHOE_SIZES[4],
    preferredLang: ((localStorage.getItem('tech_language') as TechLang) || 'ar')
  });
  
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIdPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.idNumber || !formData.employeeId) {
      toast.error(t(lang, 'fillMandatory'));
      return;
    }
    if (!idPhoto) {
      toast.error(t(lang, 'idPhotoRequired'));
      return;
    }

    setLoading(true);
    try {
      // 1. Convert photo to base64 (same pattern as Settings.tsx)
      let idPhotoUrl = '';
      if (idPhoto) {
        idPhotoUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(idPhoto);
        });
      }

      // 2. Submit profile completion
      const res = await fetch('/api/tech/profile/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.fullName,
          idNumber: formData.idNumber,
          employeeId: formData.employeeId,
          experienceLevel: formData.experienceLevel || null,
          specialty: formData.specialty,
          clothingSize: formData.clothingSize,
          shoeSize: formData.shoeSize,
          language: formData.preferredLang,
          idPhotoUrl
        })
      });

      if (!res.ok) throw new Error(t(lang, 'profileCompletedError'));

      const data = await res.json();
      setProfile(data.profile ?? data);
      localStorage.setItem('tech_language', formData.preferredLang);
      navigate('/tech');
      toast.success(t(lang, 'profileCompletedSuccess'));
      
    } catch (err: any) {
      toast.error(lang === 'ar' && err.message ? err.message : t(lang, 'profileCompletedError'));
    } finally {
      setLoading(false);
    }
  };

  const isRtl = lang === 'ar' || lang === 'ur';

  return (
    <div className="tech-app" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="tech-container slide-up pb-8">
        
        {/* Language selector for setup */}
        <div className="flex justify-center gap-2 mb-6 mt-4">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`lang-btn ${lang === l.code ? 'active' : ''}`}
              onClick={() => {
                const newLang = l.code as TechLang;
                setLang(newLang);
                localStorage.setItem('tech_language', newLang);
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
                onChange={e => setFormData({...formData, fullName: e.target.value})}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                  {t(lang, 'idNumber')}
                </label>
                <input 
                  type="text" 
                  className="tech-input" 
                  value={formData.idNumber}
                  onChange={e => setFormData({...formData, idNumber: e.target.value})}
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
                  onChange={e => setFormData({...formData, employeeId: e.target.value})}
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
                placeholder={t(lang, 'experienceLevel')}
                value={formData.experienceLevel}
                onChange={e => setFormData({...formData, experienceLevel: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                {t(lang, 'specialty')}
              </label>
              <select 
                className="tech-input appearance-none"
                value={formData.specialty}
                onChange={e => setFormData({...formData, specialty: e.target.value})}
                style={{ backgroundImage: 'none' }}
              >
                {SPECIALTIES.map(s => <option key={s} value={s}>{translateTechTaxonomy(s, lang)}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--tech-text-muted)] mb-1 px-1">
                  {t(lang, 'clothingSize')}
                </label>
                <select 
                  className="tech-input appearance-none"
                  value={formData.clothingSize}
                  onChange={e => setFormData({...formData, clothingSize: e.target.value})}
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
                  onChange={e => setFormData({...formData, shoeSize: e.target.value})}
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
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                  id="id-photo-upload"
                />
                <label htmlFor="id-photo-upload" className="cursor-pointer flex flex-col items-center">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-[var(--tech-text-muted)] mb-2" />
                  )}
                  <span className="text-sm text-[var(--tech-accent-blue)] font-medium">
                    {photoPreview ? 'Change Photo' : 'Upload ID Photo'}
                  </span>
                </label>
              </div>
            </div>

          </div>

          <button
            type="submit"
            disabled={loading}
            className="tech-btn tech-btn-success mt-6 text-lg"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : t(lang, 'saveProfile')}
          </button>
        </form>
      </div>
    </div>
  );
}
