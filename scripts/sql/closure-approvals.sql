BEGIN;
ALTER TABLE "TicketClosureReport" ADD COLUMN IF NOT EXISTS "approvalRequestId" TEXT;
ALTER TABLE "TicketClosureReport" ADD COLUMN IF NOT EXISTS "snapshot" JSONB;
CREATE TABLE IF NOT EXISTS "TicketClosureApproval" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketIds" TEXT[] NOT NULL,
  "projectId" TEXT NOT NULL,
  "unitId" TEXT,
  "clientId" TEXT,
  "requesterUid" TEXT NOT NULL,
  "approverUids" TEXT[] NOT NULL,
  "expectedRoles" JSONB NOT NULL,
  "votes" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "notes" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "TicketClosureApproval_status_createdAt_idx"
  ON "TicketClosureApproval" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "TicketClosureApproval_requesterUid_status_idx"
  ON "TicketClosureApproval" ("requesterUid", "status");
COMMIT;
