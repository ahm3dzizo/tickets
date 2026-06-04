# Script to update TicketsList.tsx
$file = 'd:\APP\tickets-main\tickets\src\pages\TicketsList.tsx'
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Add AppointmentDialog to imports if not present
if ($content -notmatch 'import \{ AppointmentDialog \}') {
    $content = $content -replace "import \{ TicketTable, parseIssuedAt, BulkActionBar \} from '@/components/tickets/TicketTable';", "import { TicketTable, parseIssuedAt, BulkActionBar } from '@/components/tickets/TicketTable';`nimport { AppointmentDialog } from '@/components/tickets/AppointmentDialog';"
}

# 2. Add state inside TicketsList
$stateCode = @'
  const [autoLinking, setAutoLinking] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);
  const [apptTicket, setApptTicket] = useState<Ticket | null>(null);
'@
$content = $content.Replace("  const [autoLinking, setAutoLinking] = useState(false);", $stateCode)

# 3. Replace handleSendAppointment
$handleSendApptOldCode = '(?s)  const handleSendAppointment = async \(\) => \{.*?  \};'
$handleSendApptNewCode = @'
  const handleSendAppointment = () => {
    const selected = tickets.find(t => selectedTicketIds.includes(t.id));
    if (!selected) return;
    setApptTicket(selected);
    setApptOpen(true);
  };
'@
$content = $content -replace $handleSendApptOldCode, $handleSendApptNewCode

# 4. Insert AppointmentDialog before </Layout>
$dialogCode = @'
        <CloseTicketDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          selectedTickets={tickets.filter(t => selectedTicketIds.includes(t.id))}
          clients={Object.values(clients)}
          projects={projects}
          onSuccess={() => { setSelectedTicketIds([]); setCloseDialogOpen(false); loadData(); }}
        />

        {apptTicket && (
          <AppointmentDialog
            open={apptOpen}
            onOpenChange={setApptOpen}
            ticket={{
              id: apptTicket.id,
              ticketId: apptTicket.ticketId,
              clientName: apptTicket.clientName,
              villaNumber: apptTicket.villaNumber,
              appointmentTime: apptTicket.appointmentTime,
              appointmentNotes: apptTicket.appointmentNotes,
              assignedSupervisorIds: apptTicket.assignedSupervisorIds as string[] | undefined,
              status: apptTicket.status,
            }}
            clientPhone={
              clients[apptTicket.clientId || '']?.phone || 
              Object.values(clients).find(c => c.villaNumber === apptTicket.villaNumber)?.phone
            }
            onSuccess={() => { setApptOpen(false); setSelectedTicketIds([]); loadData(); }}
          />
        )}
'@
$content = $content -replace '(?s)        <CloseTicketDialog.*?onSuccess=\{\(\) => \{ setSelectedTicketIds\(\[\]\); setCloseDialogOpen\(false\); loadData\(\); \}\}.*?/>', $dialogCode

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"
