import React from 'react';
import { Ticket, Client } from '@/types';
import { format } from 'date-fns';

interface TicketReportProps {
  tickets: Ticket[];
  projectName?: string;
  client?: Client;
  notes?: string;
  maintItems: { description: string; status: string }[];
}

export const TicketReport = React.forwardRef<HTMLDivElement, TicketReportProps>(({
  tickets,
  projectName,
  client,
  notes,
  maintItems,
}, ref) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const mainTicket = tickets[0];
  const ticketIdsList = tickets.map(t => t.ticketId || t.refNumber).join('، ');
  const villaNumber = mainTicket?.villaNumber || '---';
  const projectAbbr =
    mainTicket?.projectAbbr ||
    mainTicket?.refNumber?.split('-')[0] ||
    '---';
  const issuedDate = mainTicket?.issuedAt || today;

  const priorityMap: Record<string, string> = {
    low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة جداً',
    '3': 'منخفضة', '4': 'عادية', '6': 'متوسطة', '7': 'عالية', '9': 'عاجلة جداً',
  };
  const priorityLabel = mainTicket?.priority
    ? (priorityMap[String(mainTicket.priority)] || String(mainTicket.priority))
    : 'الأولوية';

  // Fill to min 4 rows
  const displayItems = [...maintItems];
  while (displayItems.length < 4) displayItems.push({ description: '', status: '' });

  const BORDER = '1px solid #505050';

  const thStyle: React.CSSProperties = {
    backgroundColor: '#EAEAEA',
    border: BORDER,
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  };

  const tdStyle: React.CSSProperties = {
    border: BORDER,
    padding: '6px 8px',
    fontSize: 11,
    textAlign: 'center',
    verticalAlign: 'middle',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    backgroundColor: '#D9D9D9',
    border: BORDER,
    padding: '6px 8px',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    verticalAlign: 'middle',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: 12,
    direction: 'rtl',
  };

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        width: 794,
        backgroundColor: '#ffffff',
        padding: '40px 40px 30px 40px',
        fontFamily: 'Tahoma, Arial, sans-serif',
        color: '#000000',
        direction: 'rtl',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.2 }}>طلب صيانة</div>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <img
            src="/logo.jpg"
            alt="Logo"
            crossOrigin="anonymous"
            style={{ height: 80, objectFit: 'contain' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', paddingTop: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Maintenance Request</div>
        </div>
      </div>

      {/* Ticket Info Table */}
      <table style={tableStyle}>
        <tbody>
          <tr>
            <th style={{ ...thStyle, width: '20%' }}>رقم الطلب</th>
            <td style={{ ...tdStyle, width: '30%', fontWeight: 'bold' }}>{ticketIdsList}</td>
            <th style={{ ...thStyle, width: '20%' }}>التاريخ</th>
            <td style={{ ...tdStyle, width: '30%' }}>{issuedDate}</td>
          </tr>
          <tr>
            <th style={thStyle}>اسم المشروع</th>
            <td style={tdStyle}>{projectName || '---'}</td>
            <th style={thStyle}>تاريخ الإغلاق</th>
            <td style={tdStyle}>{today}</td>
          </tr>
          <tr>
            <th style={thStyle}>البلوك</th>
            <td style={tdStyle}>{client?.blockNumber || '---'}</td>
            <th style={thStyle}>حالة البطاقة</th>
            <td style={tdStyle}>تم</td>
          </tr>
          {/* Row 4 – 5 cells to match old layout */}
          <tr>
            <th style={{ ...thStyle, width: '20%' }}>رقم الوحدة</th>
            <th style={{ ...thStyle, width: '15%' }}>{priorityLabel}</th>
            <td style={{ ...tdStyle, width: '10%' }}></td>
            <th style={{ ...thStyle, width: '15%' }}>{projectAbbr}</th>
            <td style={{ ...tdStyle, width: '40%', fontWeight: 'bold', fontSize: 14 }}>{villaNumber}</td>
          </tr>
          <tr>
            <th style={thStyle}>تاريخ التسليم</th>
            <td style={tdStyle}>{client?.handoverDate || '---'}</td>
            <th style={thStyle}>تاريخ انتهاء الضمان</th>
            <td style={tdStyle}>{client?.warrantyExpiryDate || '---'}</td>
          </tr>
        </tbody>
      </table>

      {/* Client Info */}
      <table style={tableStyle}>
        <thead>
          <tr><th colSpan={4} style={sectionHeaderStyle}>معلومات العميل</th></tr>
        </thead>
        <tbody>
          <tr>
            <th style={{ ...thStyle, width: '20%' }}>الإسم</th>
            <td colSpan={3} style={{ ...tdStyle, textAlign: 'right', paddingRight: 14, fontWeight: 'bold' }}>
              {client?.name || mainTicket?.clientName || '---'}
            </td>
          </tr>
          <tr>
            <th style={thStyle}>رقم الهاتف</th>
            <td colSpan={3} style={{ ...tdStyle, textAlign: 'right', paddingRight: 14 }}>
              {client?.phone || '---'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Maintenance Items */}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...sectionHeaderStyle, width: '20%' }}>الحالة</th>
            <th style={sectionHeaderStyle}>نوع الصيانة</th>
          </tr>
        </thead>
        <tbody>
          {displayItems.map((item, i) => (
            <tr key={i} style={{ height: 36 }}>
              <td style={{ ...tdStyle, width: '20%' }}>{item.status}</td>
              <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 14 }}>{item.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Notes */}
      <table style={tableStyle}>
        <thead>
          <tr><th colSpan={2} style={sectionHeaderStyle}>ملاحظات</th></tr>
        </thead>
        <tbody>
          <tr>
            <td style={{
              ...tdStyle,
              height: 64,
              textAlign: 'right',
              paddingRight: 14,
              direction: 'rtl',
              color: notes ? '#000' : '#999',
            }}>
              {notes || 'لا توجد ملاحظات إضافية'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Rating */}
      <table style={{ ...tableStyle, marginBottom: 20 }}>
        <thead>
          <tr><th colSpan={2} style={sectionHeaderStyle}>تقييم العميل</th></tr>
        </thead>
        <tbody>
          <tr>
            {/* Right col – positive */}
            <td style={{ ...tdStyle, width: '50%', verticalAlign: 'top', padding: '10px 14px' }}>
              {['ممتاز', 'جيد'].map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginBottom: 10 }}>
                  <span style={{ fontSize: 11 }}>{label}</span>
                  <span style={{ width: 14, height: 14, border: '1px solid #000', display: 'inline-block', flexShrink: 0 }} />
                </div>
              ))}
            </td>
            {/* Left col */}
            <td style={{ ...tdStyle, width: '50%', verticalAlign: 'top', padding: '10px 14px' }}>
              {['جيد جداً', 'ضعيف', 'ضعيف جداً ( رجاء ذكر السبب )', 'ملاحظات'].map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginBottom: 8 }}>
                  <span style={{ fontSize: 11 }}>{label}</span>
                  <span style={{ width: 14, height: 14, border: '1px solid #000', display: 'inline-block', flexShrink: 0 }} />
                </div>
              ))}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signature */}
      <div style={{ textAlign: 'right', direction: 'rtl', marginTop: 16 }}>
        <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 14 }}>توقيع العميل</div>
        <div style={{ fontSize: 11, letterSpacing: 3 }}>( ........................................... )</div>
      </div>
    </div>
  );
});
