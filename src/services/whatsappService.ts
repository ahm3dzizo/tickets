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

  static async notifyTicketCreated(phoneNumber: string, ticketId: string, title: string) {
    const message =
      `مرحباً 👋\nتم فتح تذكرة صيانة جديدة\n\n📋 رقم: #${ticketId}\n📝 ${title}\n\nسيتواصل معكم فريق الصيانة قريباً 🌟`;
    return this.sendUpdate(phoneNumber, message);
  }

  static async notifyTicketResolved(phoneNumber: string, ticketId: string, title: string) {
    const message =
      `مرحباً 👋\nتمت معالجة تذكرتكم بنجاح ✅\n\n📋 رقم: #${ticketId}\n📝 ${title}\n\nشكراً لصبركم وتعاونكم 🌟`;
    return this.sendUpdate(phoneNumber, message);
  }
}
