# Script to update TicketDetail.tsx
$file = 'd:\APP\tickets-main\tickets\src\pages\TicketDetail.tsx'
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Add import after ReassignSupervisorButton import
$oldImport = "import { ReassignSupervisorButton } from '@/components/tickets/ReassignSupervisorButton';"
$newImport = "import { ReassignSupervisorButton } from '@/components/tickets/ReassignSupervisorButton';`nimport { AppointmentDialog } from '@/components/tickets/AppointmentDialog';"
$content = $content -replace [regex]::Escape($oldImport), $newImport

# 2. Replace old appointment dialog with new AppointmentDialog component
$oldDialog = "      {/\* __ Appointment Dialog __"
# Find the line number
$lines = $content -split "`n"
$startLine = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match "Appointment Dialog") {
        $startLine = $i
        Write-Host "Found 'Appointment Dialog' comment at line $($i+1)"
    }
}

Write-Host "Total lines: $($lines.Length)"
Write-Host "File updated with new import"
Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"
