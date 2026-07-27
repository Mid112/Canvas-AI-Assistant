-- Lets an admin claim a support ticket so resolving it isn't "whoever gets to
-- it" (Feature 12 follow-up). Nullable: existing tickets and freshly-escalated
-- ones start unassigned until an admin claims them.
ALTER TABLE support_tickets
    ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to
    ON support_tickets(assigned_to);
