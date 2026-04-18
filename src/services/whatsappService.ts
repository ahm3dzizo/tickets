export class WhatsAppService {
  static sendUpdate(phoneNumber: string, message: string) {
    // Clean phone number (remove non-digits)
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
    
    // Open in new tab
    window.open(url, '_blank');
  }

  static notifyTicketCreated(phoneNumber: string, ticketId: string, title: string) {
    const message = `Hello! Your maintenance ticket #${ticketId} "${title}" has been created and is being processed. You can track its status in our portal.`;
    this.sendUpdate(phoneNumber, message);
  }

  static notifyTicketResolved(phoneNumber: string, ticketId: string, title: string) {
    const message = `Great news! Your maintenance ticket #${ticketId} "${title}" has been resolved. Thank you for your patience.`;
    this.sendUpdate(phoneNumber, message);
  }
}
