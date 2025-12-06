-- Add Outlook calendar support
-- Users can connect both Google and Outlook calendars

-- Add Outlook refresh token to users
ALTER TABLE users ADD COLUMN outlook_refresh_token TEXT;

-- Add Outlook event ID to bookings (events can be created in both calendars)
ALTER TABLE bookings ADD COLUMN outlook_event_id TEXT;
