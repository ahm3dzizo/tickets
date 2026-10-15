# Supervisor-mediated shared ticket closure

The canonical route for a supervisor's own work is `POST /api/tickets/close` with `scope=self`. An initiator can instead choose **Request approval from all supervisors** in the same multi-ticket close dialog; that route is `POST /api/tickets/closure-approvals`.

## State machine

1. **Request:** atomically lock the selected tickets in sorted ID order, ensure the requester is an active or previously completed supervisor on *every* ticket and each customer has a phone, split by `projectId, unitId, clientId`, close only the requester's role, record their work per ticket, create a `TicketClosureApproval` for the other active supervisors and a report outbox row in `awaiting_approval`. The worker cannot send this state. Every approver receives a user notification and push linked to a ticket.
2. **Vote:** each invited supervisor signs `approve` or `reject` once. Votes are persisted under the request with timestamp and notes. Requests and ticket rows are locked. Full closure is allowed only when **every** approver votes approve **and** current active roles match the frozen snapshot; approved votes before resolution do not modify the other supervisors' roles.
3. **Approved:** finish each consenting supervisor's role, record the requester as the actor closing on their behalf and the consenting supervisor's vote as proof of authorization. Mark the tickets globally closed and atomically release the waiting report to `generating`. One consolidated report per customer/unit contains all completed supervisor contributions.
4. **Rejected:** the original supervisor's own role stays completed; all other supervisor responsibilities stay active, even if someone previously voted yes. Release the held job with an immutable initiator-only `snapshot`. Its image and WhatsApp caption are **explicitly partial**, not final.
5. **Canceled:** requester, project engineer or admin can cancel a pending request with a required reason. As with rejection, queue an initiator-only report and release the other roles without modifying their state.
6. **Delivered:** the existing WhatsApp outbox uses atomic claiming, avoids automatic duplicate retries for ambiguous failures, and writes the actual send event to the ticket audit only after success.

## Limits and safeguards

- Requests group multiple tickets of one customer/unit into a single report, but never combine reports of different customers or units. Maintenance items are associated with a ticket; multi-customer requests with shared free-form notes are rejected rather than risk customer-information leakage.
- While a request is pending, other closure, status or reassignment mutations through the standard routes are blocked. If a background reassignment nevertheless changes the supervisor snapshot, approval fails with a conflict until cancellation.
- Approval requests require an existing customer phone. A report outbox record is created **before** notifying approvers, in the same transaction as the request. No report is rendered or sent until the exact final/partial scope is known.
- PWA notification deep links to `/tickets/:id`, which displays the approval panel; there is a protected `/closure-approvals` inbox too.
- Each approval, denial, on-behalf completion, cancellation, report queueing and successful WhatsApp send has a ticket audit event. The audit reader resolves supervisor IDs into display names and enforces project/assignment access.
- State changes and queue creation are committed transactionally; external pushes can fail independently but the approvals remain discoverable in the inbox.

## Deployment

No Prisma migration baseline exists in this repository. This change adds an **idempotent** SQL migration at `scripts/sql/closure-approvals.sql`, checked against the exact schema delta by `scripts/apply-closure-approvals.js`. The production workflow refuses unexpected schema modifications. Approval/report tables and schema are generated before switching the frontend and restarting the API.

## Verification

CI runs TypeScript, focused supervisor-closure state tests, date tests, the strict schema delta check and a Vite build. Live multi-user API concurrency, real WhatsApp delivery and report rendering still require staging/production smoke testing with an actual DB and configured WhatsApp.
