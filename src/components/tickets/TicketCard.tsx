import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  MoreVertical,
  MessageSquare,
  MessageCircle,
  CalendarDays
} from 'lucide-react';
import { Ticket } from '@/types';
import { cn, formatAppointmentDayTime } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface TicketCardProps {
  ticket: Ticket;
}

const statusColors: Record<string, string> = {
  'open': 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'in-progress': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'pending': 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  'completed': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'closed': 'bg-slate-800 text-slate-500 border-slate-700',
  'out-of-scope': 'bg-rose-500/15 text-rose-400 border-rose-500/20',
};

const priorityIcons = {
  'low': <ArrowUpRight className="w-3 h-3 text-slate-500" />,
  'medium': <ArrowUpRight className="w-3 h-3 text-blue-400" />,
  'high': <AlertCircle className="w-3 h-3 text-amber-400" />,
  'urgent': <AlertCircle className="w-3 h-3 text-red-500 animate-pulse" />,
};

const statusTranslations: Record<string, string> = {
  'open': 'مفتوح',
  'in-progress': 'قيد التنفيذ',
  'pending': 'معلق',
  'waiting': 'في انتظار رد العميل',
  'completed': 'مكتمل',
  'closed': 'مغلق',
  'out-of-scope': 'خارج اختصاص',
};

const priorityTranslations: Record<string, string> = {
  'low': 'منخفضة',
  'medium': 'متوسطة',
  'high': 'عالية',
  'urgent': 'عاجلة',
};

export function TicketCard({ ticket }: TicketCardProps) {
  const navigate = useNavigate();

  return (
    <Card 
      className="bg-card border-border hover:border-blue-500/30 transition-all cursor-pointer group rounded-2xl shadow-lg shadow-black/10"
      onClick={() => navigate(`/tickets/${ticket.id}`)}
    >
      <CardHeader className="p-5 flex items-start justify-between space-y-0">
        <div className="space-y-2 text-right">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-[10px] text-slate-500 font-mono font-medium">#{ticket.id.slice(0, 8)}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full",
              ticket.status === 'pending' && ticket.appointmentTime
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                : statusColors[ticket.status]
            )}>
              {ticket.status === 'pending' && ticket.appointmentTime
                ? 'تم تحديد موعد'
                : (statusTranslations[ticket.status] ?? ticket.status)}
            </Badge>
          </div>
          <h3 className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors text-base leading-tight">
            فيلا {ticket.unitNumber}
          </h3>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white rounded-full">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-5 pt-0 space-y-5 text-right">
        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
          {ticket.description}
        </p>

        {ticket.status === 'waiting' && !ticket.appointmentTime && (
          <div className="flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2.5 text-violet-400">
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold">في انتظار رد العميل</span>
          </div>
        )}
        {ticket.status === 'pending' && !ticket.appointmentTime && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-amber-400">
            <Clock className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold">في انتظار تحديد موعد</span>
          </div>
        )}

        {ticket.appointmentTime && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5">
            <CalendarDays className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500 font-medium">
                موعد الزيارة
              </div>
              <div className="text-xs text-emerald-400 font-bold truncate">
                {formatAppointmentDayTime(ticket.appointmentTime)}
              </div>
            </div>
          </div>
        )}

        {ticket.lastWaSentAt && (
          <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2.5">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-green-400 shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500 font-medium">واتساب أُرسل</div>
              <div className="text-xs text-green-400 font-bold truncate">
                {formatDistanceToNow(new Date(ticket.lastWaSentAt), { addSuffix: true, locale: ar })}
              </div>
            </div>
          </div>
        )}

        {ticket.appointmentNotes && (
          <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2.5">
            <div className="text-[10px] text-slate-500 font-medium mb-1">
              ملاحظات الموعد
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
              {ticket.appointmentNotes}
            </p>
          </div>
        )}
        
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
              {priorityIcons[ticket.priority]}
              <span>{priorityTranslations[ticket.priority]}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>3</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>{format(new Date(ticket.createdAt), 'MMM d')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
