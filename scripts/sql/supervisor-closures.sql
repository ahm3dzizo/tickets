BEGIN;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "supervisorClosures" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS "TicketClosureReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketIds" TEXT[] NOT NULL,
  "senderUid" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "caption" TEXT NOT NULL,
  "image" BYTEA NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "TicketClosureReport_state_createdAt_idx" ON "TicketClosureReport" ("state", "createdAt");
COMMIT;
