# Script to replace old Appointment Dialog with new AppointmentDialog component
$file = 'd:\APP\tickets-main\tickets\src\pages\TicketDetail.tsx'
$content = Get-Content $file -Raw -Encoding UTF8

$oldBlock = @'
      {/* ── Appointment Dialog ────────────────────────── */}
      <Dialog open={apptOpen} onOpenChange={setApptOpen}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[400px] rounded-3xl shadow-2xl shadow-black/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white text-right">تحديد موعد الزيارة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">التاريخ</Label>
              <Input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)}
                className="bg-white/5 border-border rounded-xl h-11 text-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">الوقت</Label>
              <Input type="time" value={apptTime} onChange={e => setApptTime(e.target.value)}
                className="bg-white/5 border-border rounded-xl h-11 text-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">ملاحظات</Label>
              <textarea value={apptNotes} onChange={e => setApptNotes(e.target.value)}
                placeholder="أي تعليمات للفني أو العميل..."
                className="w-full bg-white/5 border border-border rounded-xl p-3 text-right text-slate-200 text-sm resize-none h-20" />
            </div>
            <Button onClick={handleSaveAppointment} disabled={apptSaving || !apptDate}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-12 font-bold">
              {apptSaving ? 'جارٍ الحفظ...' : 'تأكيد الموعد'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
'@

$newBlock = @'
      {/* ── Appointment Dialog (Smart) ──────────────── */}
      {ticket && (
        <AppointmentDialog
          open={apptOpen}
          onOpenChange={setApptOpen}
          ticket={{
            id: ticket.id,
            ticketId: ticket.ticketId,
            clientName: ticket.clientName,
            villaNumber: ticket.villaNumber,
            appointmentTime: ticket.appointmentTime,
            appointmentNotes: ticket.appointmentNotes,
            assignedSupervisorIds: ticket.assignedSupervisorIds as string[] | undefined,
            status: ticket.status,
          }}
          clientPhone={client?.phone}
          onSuccess={() => { setApptOpen(false); loadData(); }}
        />
      )}
'@

if ($content.Contains($oldBlock.Trim())) {
    Write-Host "Found old dialog block - replacing..."
    $content = $content.Replace($oldBlock.Trim(), $newBlock.Trim())
    Set-Content $file -Value $content -Encoding UTF8 -NoNewline
    Write-Host "Done!"
} else {
    Write-Host "Old dialog block NOT found - checking file..."
    # Try to find the Appointment Dialog comment
    $idx = $content.IndexOf("{/* -- Appointment Dialog")
    Write-Host "Index of comment: $idx"
    $idx2 = $content.IndexOf("Appointment Dialog")
    Write-Host "Index of 'Appointment Dialog': $idx2"
}
