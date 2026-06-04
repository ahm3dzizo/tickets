# Replace appointment dialog using line numbers
$file = 'd:\APP\tickets-main\tickets\src\pages\TicketDetail.tsx'
$lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)

Write-Host "Total lines: $($lines.Length)"

# Find the appointment dialog start and end
$startLine = -1
$endLine = -1

for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'Appointment Dialog' -and $lines[$i] -match '/\*' -and $i -gt 100) {
        $startLine = $i
        Write-Host "Start: line $($i+1) = $($lines[$i])"
    }
}

# Find the closing </Dialog> after the appointment dialog
if ($startLine -ge 0) {
    for ($i = $startLine; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '^\s+</Dialog>' -or $lines[$i] -eq '      </Dialog>') {
            $endLine = $i
            Write-Host "End candidate: line $($i+1) = [$($lines[$i])]"
            break
        }
    }
}

Write-Host "StartLine: $($startLine+1), EndLine: $($endLine+1)"

if ($startLine -ge 0 -and $endLine -ge 0) {
    $newContent = @(
        '      {/* __ Appointment Dialog (Smart) ______________ */',
        '      {ticket && (',
        '        <AppointmentDialog',
        '          open={apptOpen}',
        '          onOpenChange={setApptOpen}',
        '          ticket={{',
        '            id: ticket.id,',
        '            ticketId: ticket.ticketId,',
        '            clientName: ticket.clientName,',
        '            villaNumber: ticket.villaNumber,',
        '            appointmentTime: ticket.appointmentTime,',
        '            appointmentNotes: ticket.appointmentNotes,',
        '            assignedSupervisorIds: ticket.assignedSupervisorIds as string[] | undefined,',
        '            status: ticket.status,',
        '          }}',
        '          clientPhone={client?.phone}',
        '          onSuccess={() => { setApptOpen(false); loadData(); }}',
        '        />',
        '      )}'
    )
    
    # Build new lines array
    $before = $lines[0..($startLine-1)]
    $after = $lines[($endLine+1)..($lines.Length-1)]
    $result = $before + $newContent + $after
    
    [System.IO.File]::WriteAllLines($file, $result, [System.Text.Encoding]::UTF8)
    Write-Host "Done! New total lines: $($result.Length)"
} else {
    Write-Host "Could not find dialog bounds"
}
