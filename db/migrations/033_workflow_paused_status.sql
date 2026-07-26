-- Allow paused as a workflow lifecycle state for multi-preview management (#1237).

ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;

ALTER TABLE workflows
    ADD CONSTRAINT workflows_status_check
    CHECK (status IN (
        'pending',
        'paused',
        'executing',
        'executed',
        'failed',
        'cancelled',
        'superseded'
    ));
