# Script to update AppointmentDialog.tsx
$file = 'd:\APP\tickets-main\tickets\src\components\tickets\AppointmentDialog.tsx'
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Add state for dynamic preview
$stateCode = @'
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [dynamicPreview, setDynamicPreview] = useState<string>('جاري تحميل الرسالة...');

  // Fetch dynamic preview when parameters change
  useEffect(() => {
    if (!open) return;
    const fetchPreview = async () => {
      try {
        const result = await whatsappApi.previewAppointmentRange(ticket.id, {
          startDate,
          endDate,
          preferredTime: preferredTimeLabel,
          notes: notes || undefined,
          phone: clientPhone || '966500000000',
          clientName: ticket.clientName,
          villaNumber: ticket.villaNumber,
        });
        setDynamicPreview(result.text);
      } catch (err) {
        console.error('Failed to fetch preview', err);
      }
    };
    const timer = setTimeout(fetchPreview, 500);
    return () => clearTimeout(timer);
  }, [open, startDate, endDate, preferredTimeLabel, notes, ticket, clientPhone]);
'@
$content = $content -replace '(?s)  const \[saving, setSaving\] = useState\(false\);`r?`n  const \[sending, setSending\] = useState\(false\);', $stateCode

# 2. Replace static previewMsg usage
$previewBoxOld = '(?s)  // ── Preview نص الرسالة ──.*?</ScrollArea>'
$previewBoxNew = @'
  // ── Preview نص الرسالة ──
  const previewBox = (
    <ScrollArea className="h-48 w-full rounded-xl border border-border/50 bg-slate-900/50 p-4" dir="rtl">
      <div className="flex flex-col gap-1.5 text-sm whitespace-pre-wrap text-slate-300">
        {dynamicPreview}
      </div>
    </ScrollArea>
  );
'@
$content = $content -replace $previewBoxOld, $previewBoxNew

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"
