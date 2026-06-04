# Script to add preview endpoints to server/routes/whatsapp.ts
$file = 'd:\APP\tickets-main\tickets\server\routes\whatsapp.ts'
$content = Get-Content $file -Raw -Encoding UTF8

$previewEndpoint = @'
// ─── POST /api/whatsapp/preview-appointment-range ────────────────────────────
router.post('/preview-appointment-range/:ticketId', requireAuth, async (req: AuthRequest, res) => {
  const { ticketId } = req.params;
  const { startDate, endDate, preferredTime, notes, clientName, villaNumber } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { ticketId: true, clientName: true, villaNumber: true },
    });
    if (!ticket) { res.status(404).json({ error: 'التذكرة غير موجودة' }); return; }

    const fmtDate = (d: string) => new Date(d).toLocaleDateString('ar-EG', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    const msg = await buildAppointmentRangeMsg({
      clientName: clientName || ticket.clientName,
      ticketId: ticket.ticketId,
      villaNumber: villaNumber || ticket.villaNumber,
      startDate: fmtDate(startDate),
      endDate: fmtDate(endDate),
      preferredTime,
      notes: notes || null,
    });

    res.json({ text: msg });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
'@

# Insert the preview endpoint before the POST /api/whatsapp/appointment-range
$content = $content -replace "(?s)// ─── POST /api/whatsapp/appointment-range", "$previewEndpoint`n`n// ─── POST /api/whatsapp/appointment-range"

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"
