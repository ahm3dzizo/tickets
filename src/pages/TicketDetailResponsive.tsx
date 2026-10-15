import { useParams } from 'react-router-dom';
import { SupervisorClosureApprovals } from '@/components/tickets/SupervisorClosureApprovals';
import TicketDetailCarousel from '@/pages/TicketDetailCarousel';
import '@/pages/ticket-detail-responsive.css';

export default function TicketDetailResponsive() {
  const { id } = useParams<{id: string}>();
  return (
    <div className="ticket-detail-responsive space-y-3">
      {/* Notification links land on ticket details: decision is available here. */}
      <SupervisorClosureApprovals ticketId={id} />
      <TicketDetailCarousel />
    </div>
  );
}
