-- Per-event-type booking limits (NULL = use the default)
-- min_notice_minutes: how far ahead a slot must be before it can be booked (default 0)
-- max_advance_days: how far into the future slots are offered (default 60)
-- buffer_minutes already exists: free time kept before and after other events
-- Event specific weekly hours use availability_rules.event_type_id (no schema change)

ALTER TABLE event_types ADD COLUMN min_notice_minutes INTEGER;
ALTER TABLE event_types ADD COLUMN max_advance_days INTEGER;
