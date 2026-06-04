# Script to remove emojis from frontend components
$files = @(
  'd:\APP\tickets-main\tickets\src\hooks\useAppointmentNotifications.ts',
  'd:\APP\tickets-main\tickets\src\components\tickets\AppointmentDialog.tsx',
  'd:\APP\tickets-main\tickets\src\pages\TicketDetail.tsx',
  'd:\APP\tickets-main\tickets\src\pages\Settings.tsx',
  'd:\APP\tickets-main\tickets\src\pages\TicketsList.tsx'
)

foreach ($file in $files) {
  $content = Get-Content $file -Raw -Encoding UTF8
  $content = $content -replace '📅 ', ''
  $content = $content -replace '✅ ', ''
  $content = $content -replace ' ✅', ''
  $content = $content -replace '⚠️ ', ''
  $content = $content -replace ' ⚠️', ''
  $content = $content -replace '💬', ''
  $content = $content -replace '🎉', ''
  $content = $content -replace '⚙ ', ''
  Set-Content $file -Value $content -Encoding UTF8 -NoNewline
}
Write-Host "Done"
