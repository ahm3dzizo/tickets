const TOKEN_KEY = 'retal_auth_token';

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
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanNumber}?text=${encodedMessage}`, '_blank');
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
      if (res.ok) return await res.json();
    } catch {}
    return { openingMsg: '', closingMsg: '' };
  }
}
