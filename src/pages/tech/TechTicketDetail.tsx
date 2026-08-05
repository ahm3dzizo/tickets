import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { ArrowLeft, ArrowRight, MapPin, Phone, Globe, Play, Pause, CheckCircle2, Clock, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import './tech.css';

export default function TechTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, techProfile } = useTechAuth();
  
  const lang = (techProfile?.lang || 'ar') as TechLang;
  const isRtl = lang === 'ar' || lang === 'ur';

  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [pauseReason, setPauseReason] = useState('');

  useEffect(() => {
    // Mock fetch ticket
    setTimeout(() => {
      setTicket({
        id,
        ref: 'NTF-436',
        villa: 'Villa 47',
        clientPhone: '0551234567',
        description: 'يوجد تسريب مياه من سقف الحمام في الدور الأرضي',
        status: 'IN_PROGRESS',
        startTime: new Date(Date.now() - 45 * 60000).toISOString(),
      });
      setLoading(false);
    }, 500);
  }, [id]);

  const handleTranslate = async () => {
    if (!ticket?.description) return;
    
    // Check cache
    const text = ticket.description;
    const hash = btoa(encodeURIComponent(text)).slice(0, 20);
    const cacheKey = `trans_${lang}_${hash}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      setTranslatedText(cached);
      return;
    }

    setTranslating(true);
    try {
      // Mock API call
      // const res = await fetch('/api/translate', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      //   body: JSON.stringify({ text, targetLang: lang })
      // });
      // const data = await res.json();
      
      // Simulate network delay
      await new Promise(r => setTimeout(r, 1000));
      const mockTranslation = lang === 'en' ? 'There is a water leak from the bathroom ceiling on the ground floor.' 
                            : lang === 'hi' ? 'भूतल पर बाथरूम की छत से पानी का रिसाव हो रहा है।'
                            : 'گراؤنڈ فلور پر باتھ روم کی چھت سے پانی کا رساو ہے۔';
      
      setTranslatedText(mockTranslation);
      localStorage.setItem(cacheKey, mockTranslation);
    } catch (err) {
      toast.error('Translation failed');
    } finally {
      setTranslating(false);
    }
  };

  const handleAction = async (action: string) => {
    if (action === 'arrive') {
      toast.info(t(lang, 'locating'));
      // Request GPS
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            toast.success('Arrived at location successfully');
            setTicket({ ...ticket, status: 'IN_PROGRESS' });
          },
          (err) => {
            toast.error(t(lang, 'locationError'));
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }
    } else if (action === 'start') {
      setTicket({ ...ticket, status: 'EN_ROUTE' });
    } else if (action === 'resume') {
      setTicket({ ...ticket, status: 'IN_PROGRESS' });
    }
  };

  const handleComplete = () => {
    toast.success('Ticket completed successfully');
    setShowCompleteModal(false);
    navigate('/tech');
  };

  const handlePause = () => {
    toast.success('Ticket paused');
    setTicket({ ...ticket, status: 'PAUSED' });
    setShowPauseModal(false);
  };

  if (loading) return <div className="tech-app flex justify-center items-center min-h-[100dvh]"><Clock className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="tech-app" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="tech-header">
        <button onClick={() => navigate('/tech')} className="p-2 -ml-2 rounded-xl hover:bg-white/10">
          {isRtl ? <ArrowRight className="w-6 h-6" /> : <ArrowLeft className="w-6 h-6" />}
        </button>
        <div className="font-bold text-lg">{ticket?.ref}</div>
        <div className="w-10"></div> {/* Spacer for centering */}
      </div>

      <div className="tech-container">
        {/* Status Badge */}
        <div className="flex justify-center mb-6 mt-2">
          <div className={`px-4 py-2 rounded-full font-bold text-sm ${
            ticket.status === 'EN_ROUTE' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
            ticket.status === 'IN_PROGRESS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 pulse-anim' :
            ticket.status === 'PAUSED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {t(lang, `status_${ticket.status}`)}
            {ticket.status === 'IN_PROGRESS' && ' • 45m'}
          </div>
        </div>

        {/* Info Card */}
        <div className="tech-card mb-6">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--tech-border)]">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-[var(--tech-text-muted)]">{t(lang, 'villa')}</div>
              <div className="font-bold text-lg">{ticket.villa}</div>
            </div>
          </div>

          <a href={`tel:${ticket.clientPhone}`} className="flex items-center justify-between p-3 rounded-xl bg-[var(--tech-border)] mb-4 active:scale-95 transition-transform">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-emerald-500" />
              <div>
                <div className="text-xs text-[var(--tech-text-muted)]">{t(lang, 'clientPhone')}</div>
                <div className="font-bold" dir="ltr">{ticket.clientPhone}</div>
              </div>
            </div>
            <div className="text-emerald-500 font-bold px-3 py-1 bg-emerald-500/10 rounded-lg">Call</div>
          </a>

          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-bold text-[var(--tech-text-muted)]">Description</div>
              {lang !== 'ar' && (
                <button 
                  onClick={handleTranslate}
                  disabled={translating}
                  className="text-xs flex items-center gap-1 text-[var(--tech-accent-blue)] bg-blue-500/10 px-2 py-1 rounded-md"
                >
                  <Globe className="w-3 h-3" />
                  {translating ? t(lang, 'translating') : t(lang, 'translate')}
                </button>
              )}
            </div>
            <p className="text-sm leading-relaxed p-3 bg-black/20 rounded-xl">
              {ticket.description}
            </p>
            
            {translatedText && (
              <div className="mt-3 p-3 bg-[var(--tech-accent-blue)]/10 border border-blue-500/20 rounded-xl relative">
                <div className="absolute top-0 right-3 -translate-y-1/2 bg-[var(--tech-card)] px-1 text-[10px] text-blue-400">Translated</div>
                <p className="text-sm leading-relaxed">{translatedText}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {ticket.status === 'CLAIMED' && (
            <button onClick={() => handleAction('start')} className="tech-btn tech-btn-primary gap-2">
              <Navigation className="w-5 h-5" />
              Start Travel
            </button>
          )}

          {ticket.status === 'EN_ROUTE' && (
            <button onClick={() => handleAction('arrive')} className="tech-btn tech-btn-success gap-2">
              <MapPin className="w-5 h-5" />
              {t(lang, 'arrived')}
            </button>
          )}

          {(ticket.status === 'IN_PROGRESS' || ticket.status === 'PAUSED') && (
            <div className="grid grid-cols-2 gap-3">
              {ticket.status === 'IN_PROGRESS' ? (
                <button onClick={() => setShowPauseModal(true)} className="tech-btn tech-btn-warning gap-2">
                  <Pause className="w-5 h-5" />
                  {t(lang, 'pause')}
                </button>
              ) : (
                <button onClick={() => handleAction('resume')} className="tech-btn tech-btn-primary gap-2">
                  <Play className="w-5 h-5" />
                  {t(lang, 'resume')}
                </button>
              )}
              
              <button onClick={() => setShowCompleteModal(true)} className="tech-btn tech-btn-success gap-2">
                <CheckCircle2 className="w-5 h-5" />
                {t(lang, 'complete')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4 pb-0 sm:pb-4">
          <div className="bg-[var(--tech-card)] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 slide-up">
            <h3 className="text-xl font-bold mb-4">{t(lang, 'complete')}</h3>
            <label className="block text-sm text-[var(--tech-text-muted)] mb-2">
              {t(lang, 'completionNotes')}
            </label>
            <textarea 
              className="tech-input min-h-[120px] mb-6 resize-none" 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What was done?..."
            />
            <div className="flex gap-3">
              <button onClick={() => setShowCompleteModal(false)} className="tech-btn tech-btn-outline flex-1">
                Cancel
              </button>
              <button onClick={handleComplete} className="tech-btn tech-btn-success flex-1">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showPauseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4 pb-0 sm:pb-4">
          <div className="bg-[var(--tech-card)] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 slide-up">
            <h3 className="text-xl font-bold mb-4">{t(lang, 'pause')}</h3>
            <label className="block text-sm text-[var(--tech-text-muted)] mb-2">
              {t(lang, 'pauseReason')}
            </label>
            <select 
              className="tech-input mb-6"
              value={pauseReason}
              onChange={e => setPauseReason(e.target.value)}
            >
              <option value="">Select a reason...</option>
              <option value="parts">Awaiting Parts</option>
              <option value="shift">End of Shift</option>
              <option value="client">Client Not Available</option>
              <option value="other">Other</option>
            </select>
            <div className="flex gap-3">
              <button onClick={() => setShowPauseModal(false)} className="tech-btn tech-btn-outline flex-1">
                Cancel
              </button>
              <button onClick={handlePause} disabled={!pauseReason} className="tech-btn tech-btn-warning flex-1">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
