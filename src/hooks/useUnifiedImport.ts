import { useState } from 'react';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';

// Note: processTicketRow from @/server/import/ticket.importer was removed
// because the module doesn't exist. Import logic is now in UnifiedImportModal.tsx.

interface UseUnifiedImportProps {
  projectId: string;
  projectAbbr: string;
  clients: any[];
  currentUserId?: string;
}

export function useUnifiedImport({
  projectId,
  projectAbbr,
  clients,
  currentUserId,
}: UseUnifiedImportProps) {

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const processImport = async (data: any[]) => {
    if (!projectId) {
      toast.error('اختر المشروع أولاً');
      return { processed: [], unmatched: [] };
    }

    setLoading(true);
    setProgress(0);

    const processed: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      // fallback: used to call processTicketRow which is no longer available
            const ticket = {
        item: row,
        projectId,
        projectAbbr,
        clients,
        currentUserId,
      };

      processed.push(ticket);

      setProgress((i + 1) / data.length);
    }

    const matched = processed.filter(t => t.clientId);
    const unmatched = processed.filter(t => !t.clientId);

    setLoading(false);

    return { processed, matched, unmatched };
  };

  const finalizeImport = async (tickets: any[]) => {
    const BATCH_SIZE = 50;

    let success = 0;
    let fail = 0;

    setLoading(true);

    for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
      const batch = tickets.slice(i, i + BATCH_SIZE);

      try {
        await ticketsApi.bulkCreate(batch);
        success += batch.length;
      } catch (err) {
        fail += batch.length;
      }

      setProgress((i + batch.length) / tickets.length);
    }

    setLoading(false);

    if (fail === 0) {
      toast.success(`تم استيراد ${success} تذكرة`);
    } else {
      toast.error(`نجح ${success} وفشل ${fail}`);
    }
  };

  return {
    loading,
    progress,
    processImport,
    finalizeImport,
  };
}