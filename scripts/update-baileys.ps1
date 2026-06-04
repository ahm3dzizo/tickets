# Script to update server/baileys.ts
$file = 'd:\APP\tickets-main\tickets\server\baileys.ts'
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Remove emojis and {clientName} from all default templates
$content = $content.Replace("`مرحباً {clientName} 👋\nتم استلام طلب الصيانة الخاص بك\n\n📋 رقم التذكرة: #{ticketId}\n📝 الوصف: {description}\n🏠 الفيلا: {villaNumber}\n📅 التاريخ: {date}\n\nسيتواصل معكم فريق الصيانة في أقرب وقت.\nشكراً لثقتكم 🌟`", "`السلام عليكم،\nتم استلام طلب الصيانة الخاص بك\n\nرقم التذكرة: #{ticketId}\nالوصف: {description}\nالفيلا: {villaNumber}\nالتاريخ: {date}\n\nسيتواصل معكم فريق الصيانة في أقرب وقت.\nشكراً لثقتكم.`")
$content = $content.Replace("`مرحباً {clientName} 👋\nتمت معالجة تذكرة الصيانة بنجاح ✅\n\n📋 رقم التذكرة: #{ticketId}\n📝 الوصف: {description}\n🏠 الفيلا: {villaNumber}${notesStr}\n\nشكراً لصبركم وتعاونكم 🌟`", "`السلام عليكم،\nتمت معالجة تذكرة الصيانة بنجاح\n\nرقم التذكرة: #{ticketId}\nالوصف: {description}\nالفيلا: {villaNumber}${notesStr}\n\nشكراً لصبركم وتعاونكم.`")
$content = $content.Replace("`السلام عليكم {clientName} 👋\n\nتم زيارة وحدتكم رقم {villaNumber} بخصوص بلاغ الصيانة #{ticketId}،\nولم يتمكن الفريق من الدخول نظراً لعدم التواجد.\n\nيرجى رفع تذكرة جديدة عند تواجدكم لإعادة جدولة الزيارة.\n\nشكراً لتفهمكم.`", "`السلام عليكم،\nتم زيارة وحدتكم رقم {villaNumber} بخصوص بلاغ الصيانة #{ticketId}، ولم يتمكن الفريق من الدخول نظراً لعدم التواجد.\nيرجى رفع تذكرة جديدة عند تواجدكم لإعادة جدولة الزيارة.\nشكراً لتفهمكم.`")
$content = $content.Replace("`السلام عليكم {clientName} 👋\n\nبخصوص بلاغ الصيانة #{ticketId} لوحدتكم رقم {villaNumber}،\nبعد المعاينة تبيّن أن المشكلة خارج نطاق الضمان.\n\nشكراً لتفهمكم.`", "`السلام عليكم،\nبخصوص بلاغ الصيانة #{ticketId} لوحدتكم رقم {villaNumber}، بعد المعاينة تبيّن أن المشكلة خارج نطاق الضمان.\nشكراً لتفهمكم.`")

# Remove {clientName} from replaceVars
$content = $content.Replace(".replace(/{clientName}/g, params.clientName)", "")

# 2. Update buildAppointmentRangeMsg to use openingMsg
$apptRangeCode = @'
export async function buildAppointmentRangeMsg(params: AppointmentRangeParams): Promise<string> {
  const defaultOpeningMsg = `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم {villaNumber}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`;
  
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'whatsapp_templates' } });
  const templates = (setting?.value ?? {}) as Record<string, string>;
  const baseMsg = templates.openingMsg || defaultOpeningMsg;

  let msg = baseMsg
    .replace(/{ticketId}/g, params.ticketId)
    .replace(/{villaNumber}/g, params.villaNumber);

  msg += `\n\nتفاصيل الموعد المقترح:\n`;
  msg += `من ${params.startDate}\n`;
  msg += `إلى ${params.endDate}\n\n`;
  msg += `الوقت المفضل: ${params.preferredTime}\n`;
  if (params.notes) {
    msg += `ملاحظات: ${params.notes}\n`;
  }
  
  return msg;
}
'@

# Replace the old buildAppointmentRangeMsg function
$content = $content -replace '(?s)export async function buildAppointmentRangeMsg.*?\}', $apptRangeCode

# 3. Remove Emojis from approval request
$content = $content.Replace("`مرحباً ${clientName} 👋\n\nنرجو منكم تأكيد الموافقة على إغلاق تذكرة الصيانة رقم: *#${ticket.ticketId}* لوحدتكم.\n\nالرجاء الرد بـ:\n*1* — للموافقة ✅\n*2* — للرفض ❌\n\nشكراً لتعاونكم 🌟`", "`السلام عليكم،\nنرجو منكم تأكيد الموافقة على إغلاق تذكرة الصيانة رقم: *#${ticket.ticketId}* لوحدتكم.\n\nالرجاء الرد بـ:\n*1* — للموافقة\n*2* — للرفض\n\nشكراً لتعاونكم.`")

# 4. Remove emojis from rating request
$content = $content -replace '(?s)      `شكراً \$\{clientName\} على موافقتك! 🌟\\n\\n` \+.*?      `_فريق ريتال للصيانة_`;', "`شكراً على موافقتكم!\n\nكيف تقيم خدمة الصيانة؟\nأرسل رقماً من 1 إلى 5:\n\n*5* — ممتاز\n*4* — جيد جداً\n*3* — جيد\n*2* — مقبول\n*1* — ضعيف\n\nفريق ريتال للصيانة`;"

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"
