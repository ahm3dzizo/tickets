# Script to update TicketDetail.tsx
$file = 'd:\APP\tickets-main\tickets\src\pages\TicketDetail.tsx'
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Update handleWhatsApp to use settingsApi
$handleWaOld = '(?s)  const handleWhatsApp = async \(\) => \{.*?    try \{.*?      const r = await whatsappApi\.send\(phone, msg\);.*?    \} catch.*?  \};'
$handleWaNew = @'
  const handleWhatsApp = async () => {
    const phone = client?.phone?.replace(/\D/g, '') || '';
    if (!phone) { toast.error('رقم الهاتف غير متوفر'); return; }
    
    setWaSending(true);
    try {
      const templates = await settingsApi.getWhatsAppTemplates();
      const baseMsg = templates.openingMsg || `السلام عليكم،\nتم استلام طلب الصيانة الخاص بك\n\nرقم التذكرة: #{ticketId}\nالوصف: {description}\nالفيلا: {villaNumber}\n\nسيتواصل معكم فريق الصيانة في أقرب وقت.\nشكراً لثقتكم.`;
      
      let msg = baseMsg
        .replace(/{ticketId}/g, ticket?.ticketId || '')
        .replace(/{description}/g, ticket?.description || '')
        .replace(/{villaNumber}/g, ticket?.villaNumber || '');

      if (ticket?.appointmentTime) {
        msg += `\n\nتحديث: موعد الزيارة المحدد هو ${ticket.appointmentTime}`;
      }

      const r = await whatsappApi.send(phone, msg);
      if (r?.sent) {
        toast.success('تم إرسال الرسالة للعميل عبر واتساب');
        setWaSent(true);
        setTimeout(() => navigate(-1), 800);
      } else {
        toast.error('فشل إرسال الرسالة');
      }
    } catch {
      toast.error('خطأ في الاتصال');
    } finally {
      setWaSending(false);
    }
  };
'@
$content = $content -replace $handleWaOld, $handleWaNew

# 2. Remove unused handleSaveAppointment and its states
$content = $content -replace '(?s)  const \[apptDate, setApptDate\] = useState<string>\(.*?  const handleSaveAppointment = async \(\) => \{.*?\n  \};\n', ''

# 3. Update the click handler for 'تحديد موعد زيارة'
$content = $content -replace "setApptDate\(ticket.appointmentTime\?.split\(' '\)\[0\] \|\| todayStr\(\)\);\s*setApptTime\(ticket.appointmentTime\?.split\(' '\)\[1\] \|\| ''\);\s*setApptNotes\(ticket.appointmentNotes \|\| ''\);\s*setApptOpen\(true\);", "setApptOpen(true);"

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"
