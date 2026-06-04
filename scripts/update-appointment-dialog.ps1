# Script to update AppointmentDialog.tsx
$file = 'd:\APP\tickets-main\tickets\src\components\tickets\AppointmentDialog.tsx'
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Update imports
$content = $content.Replace("import { appointmentsApi, whatsappApi, ticketsApi } from '@/lib/api';", "import { appointmentsApi, whatsappApi, ticketsApi, settingsApi } from '@/lib/api';")

# 2. Change TIME_OPTIONS to DEFAULT_TIME_OPTIONS
$content = $content.Replace("const TIME_OPTIONS = [", "const DEFAULT_TIME_OPTIONS = [")

# 3. Add dynamic state inside component
$stateCode = @'
  const [startDate, setStartDate] = useState(todayStr());
  const [rangeDays, setRangeDays] = useState(3);
  const [timeOptions, setTimeOptions] = useState(DEFAULT_TIME_OPTIONS);
  const [timeMode, setTimeMode] = useState(DEFAULT_TIME_OPTIONS[0].value);
'@
$content = $content.Replace("  const [startDate, setStartDate] = useState(todayStr());`n  const [rangeDays, setRangeDays] = useState(3);`n  const [timeMode, setTimeMode] = useState(TIME_OPTIONS[0].value);", $stateCode)

# 4. Fetch dynamic options inside useEffect
$useEffectCode = @'
  useEffect(() => {
    if (!open) return;
    const existing = ticket.appointmentTime;
    if (existing) {
      const parts = existing.split(' ');
      setStartDate(parts[0] || todayStr());
    } else {
      setStartDate(todayStr());
    }
    setNotes(ticket.appointmentNotes || '');
    setRangeDays(3);
    setCustomTime('09:00');
    setShowPreview(false);
    setConflicts([]);
    
    // Fetch work hours
    settingsApi.getWorkHours().then(hours => {
      const opts = hours && hours.length > 0 ? hours : DEFAULT_TIME_OPTIONS;
      const finalOpts = [...opts, { label: '🕐 وقت محدد', value: 'custom' }];
      setTimeOptions(finalOpts);
      setTimeMode(finalOpts[0].value);
    }).catch(() => {
      const opts = [...DEFAULT_TIME_OPTIONS, { label: '🕐 وقت محدد', value: 'custom' }];
      setTimeOptions(opts);
      setTimeMode(opts[0].value);
    });
  }, [open]);
'@

# Locate old useEffect using Regex since we can't be sure of exact spacing
$content = $content -replace '(?s)  // ── تهيئة القيم عند فتح الـ Dialog ──.*?  \}, \[open\]\);', $useEffectCode

# 5. Fix timeMode references
$content = $content.Replace("TIME_OPTIONS.find(o => o.value === timeMode)", "timeOptions.find(o => o.value === timeMode)")
$content = $content.Replace("TIME_OPTIONS.map(opt => (", "timeOptions.map(opt => (")
$content = $content.Replace("TIME_OPTIONS[0]", "DEFAULT_TIME_OPTIONS[0]")

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"
