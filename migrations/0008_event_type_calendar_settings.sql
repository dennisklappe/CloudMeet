-- Add per-event-type calendar settings
-- availability_calendars: which calendars to check for availability ('google', 'outlook', 'both')
-- invite_calendar: which calendar sends the invite to attendee ('google' or 'outlook')

ALTER TABLE event_types ADD COLUMN availability_calendars TEXT DEFAULT 'both';
ALTER TABLE event_types ADD COLUMN invite_calendar TEXT DEFAULT 'google';
