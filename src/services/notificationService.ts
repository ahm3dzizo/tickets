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

  /**
   * Write in-app Firestore notifications to each assigned supervisor
   * when a ticket is created or supervisors are updated.
   */
  static async writeAssignmentNotifications(
    supervisors: { id: string; name: string }[],
    ticketDocId: string,
    ticketRef: string,
    villaNumber: string,
    description: string
  ) {
    if (!supervisors.length) return;
    await Promise.all(
      supervisors.map(sup =>
        addDoc(collection(db, `notifications/${sup.id}/items`), {
          type: 'ticket_assigned',
          title: 'تم تعيينك على تذكرة',
          body: `${ticketRef} - فيلا ${villaNumber}: ${description.slice(0, 70)}`,
          ticketDocId,
          ticketRef,
          read: false,
          createdAt: serverTimestamp(),
        })
      )
    );
  }

  /**
   * Write / upsert an in-app appointment-reminder notification.
   * Uses a deterministic doc-id (appt_{ticketDocId}) so re-saving
   * the appointment overwrites the old reminder instead of duplicating it.
   */
  static async writeAppointmentReminder(
    ticketDocId: string,
    ticketRef: string,
    villaNumber: string,
    appointmentTime: string,
    supervisorIds: string[],
    createdBy?: string
  ) {
    const targets = [...new Set([...supervisorIds, ...(createdBy ? [createdBy] : [])])];
    if (!targets.length) return;
    await Promise.all(
      targets.map(uid =>
        setDoc(
          doc(db, `notifications/${uid}/items/appt_${ticketDocId}`),
          {
            type: 'appointment_reminder',
            title: 'تذكير: موعد صيانة قادم',
            body: `${ticketRef} - فيلا ${villaNumber} | الموعد: ${appointmentTime}`,
            ticketDocId,
            ticketRef,
            appointmentTime,
            read: false,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        )
      )
    );
  }
}
