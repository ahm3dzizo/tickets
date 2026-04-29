export class NotificationService {
  static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const p = await Notification.requestPermission();
      return p === 'granted';
    }
    return false;
  }

  static async sendBrowserNotification(title: string, body: string, icon?: string) {
    if (await this.requestPermission()) {
      new Notification(title, { body, icon: icon || '/favicon.ico' });
    }
  }

  /** @deprecated use sendBrowserNotification */
  static notifyAssignment(ticketTitle: string, ticketId: string) {
    this.sendBrowserNotification(
      'تم تعيينك على تذكرة',
      `${ticketTitle} (#${ticketId})`
    );
  }

  /** No-op: in-app notifications not supported in PostgreSQL backend */
  static async writeAssignmentNotifications(
    _supervisors: { id: string; name: string }[],
    _ticketDocId: string,
    _ticketRef: string,
    _villaNumber: string,
    _description: string
  ) { /* notifications not implemented */ }

  /** No-op: in-app notifications not supported in PostgreSQL backend */
  static async writeAppointmentReminder(
    _ticketDocId: string,
    _ticketRef: string,
    _villaNumber: string,
    _appointmentTime: string,
    _supervisorIds: string[],
    _createdBy?: string
  ) { /* notifications not implemented */ }
}
