# Check actual content around the dialog comment
$file = 'd:\APP\tickets-main\tickets\src\pages\TicketDetail.tsx'
$lines = Get-Content $file -Encoding UTF8
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'Appointment Dialog') {
        Write-Host "Line $($i+1): $($lines[$i])"
        if ($i+1 -lt $lines.Length) { Write-Host "Line $($i+2): $($lines[$i+1])" }
        if ($i+2 -lt $lines.Length) { Write-Host "Line $($i+3): $($lines[$i+2])" }
    }
}
