import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  ArrowUpRight,
  MoreVertical,
  MessageSquare
} from 'lucide-react';
import { Ticket } from '@/types';
import { cn } from '@/lib/utils';
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
            <Badge variant="outline" className={cn("text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full", statusColors[ticket.status])}>
              {statusTranslations[ticket.status]}
            </Badge>
          </div>
          <h3 className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors text-base leading-tight">
            فيلا {ticket.villaNumber}
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
