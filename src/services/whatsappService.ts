import { requestWhatsAppOpen } from '@/lib/whatsappLauncher';

const TOKEN_KEY = 'retal_auth_token';

const DEFAULT_TEMPLATES = {
  openingMsg: 'السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم {unitNumber}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.',
  closingMsg: 'السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم رقم {unitNumber}، تم الانتهاء من الصيانة المطلوبة. نرجو التفضل بالتوقيع على نموذج الإغلاق المرفق.\nشكراً لتعاونكم.',
  absentMsg: 'السلام عليكم،\nتم زيارة وحدتكم رقم {unitNumber} بخصوص بلاغ الصيانة #{ticketId}، ولم يتمكن الفريق من الدخول نظراً لعدم التواجد.\nيرجى رفع تذكرة جديدة عند تواجدكم لإعادة جدولة الزيارة.\nشكراً لتفهمكم.',
  outOfScopeMsg: 'السلام عليكم،\nبخصوص بلاغ الصيانة #{ticketId} لوحدتكم رقم {unitNumber}، بعد المعاينة تبيّن أن المشكلة خارج نطاق الضمان.\nشكراً لتفهمكم.',
};

export class WhatsAppService {
  static async sendUpdate(phoneNumber: string, message: string): Promise<boolean> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ phone: phoneNumber, message }),
        });
        if (res.ok) {
          const data = await res.json() as { sent: boolean; fallback: boolean };
          if (!data.fallback) return data.sent;
        }
      } catch {}
    }
    // Fallback: open wa.me link
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    requestWhatsAppOpen(cleanNumber, message);
    return false;
  }

  static processTemplate(template: string, data: Record<string, string>): string {
    let text = template;
    const isMultiple = data.ticketId && (data.ticketId.includes('،') || data.ticketId.includes(','));
    if (isMultiple) {
      text = text.replace(/بلاغ الصيانة رقم/g, 'بلاغات الصيانة أرقام');
    }
    return text.replace(/{(\w+)}/g, (_, key) => data[key] || '');
  }

  static async getTemplates() {
    try {
      const res = await fetch('/api/settings/whatsapp-templates', {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` }
      });
      if (res.ok) {
        const data = await res.json() as Partial<typeof DEFAULT_TEMPLATES>;
        return {
          openingMsg: data.openingMsg || DEFAULT_TEMPLATES.openingMsg,
          closingMsg: data.closingMsg || DEFAULT_TEMPLATES.closingMsg,
          absentMsg: data.absentMsg || DEFAULT_TEMPLATES.absentMsg,
          outOfScopeMsg: data.outOfScopeMsg || DEFAULT_TEMPLATES.outOfScopeMsg,
        };
      }
    } catch {}
    return { ...DEFAULT_TEMPLATES };
  }
}
