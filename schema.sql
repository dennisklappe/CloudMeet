-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    google_refresh_token TEXT,
    outlook_refresh_token TEXT,
    timezone TEXT DEFAULT 'UTC',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_token TEXT,
    last_sync DATETIME,
    slug TEXT UNIQUE NOT NULL,
    settings JSON DEFAULT '{}',
    profile_image TEXT,
    brand_color TEXT DEFAULT '#3b82f6',
    contact_email TEXT
);

CREATE INDEX idx_users_slug ON users(slug);
CREATE INDEX idx_users_email ON users(email);

-- Event types (different meeting types a user can offer)
CREATE TABLE IF NOT EXISTS event_types (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    buffer_minutes INTEGER DEFAULT 0,
    color TEXT DEFAULT '#3b82f6',
    slug TEXT NOT NULL,
    description TEXT,
    location_type TEXT DEFAULT 'google_meet', -- google_meet, zoom, phone, in_person
    location_details TEXT,
    is_active BOOLEAN DEFAULT 1,
    cover_image TEXT,
    availability_calendars TEXT DEFAULT 'both', -- 'google', 'outlook', 'both'
    invite_calendar TEXT DEFAULT 'google', -- 'google' or 'outlook'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, slug)
);

CREATE INDEX idx_event_types_user ON event_types(user_id);
CREATE INDEX idx_event_types_active ON event_types(user_id, is_active);

-- Availability rules (recurring weekly schedule)
CREATE TABLE IF NOT EXISTS availability_rules (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    event_type_id TEXT, -- NULL means applies to all event types
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (event_type_id) REFERENCES event_types(id) ON DELETE CASCADE
);

CREATE INDEX idx_availability_rules_user ON availability_rules(user_id);
CREATE INDEX idx_availability_rules_active ON availability_rules(user_id, is_active);

-- Availability overrides (specific date exceptions)
CREATE TABLE IF NOT EXISTS availability_overrides (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    available BOOLEAN NOT NULL, -- false = blocked, true = override with specific times
    start_time TIME,
    end_time TIME,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_availability_overrides_user_date ON availability_overrides(user_id, date);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    event_type_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    attendee_name TEXT NOT NULL,
    attendee_email TEXT NOT NULL,
    attendee_notes TEXT,
    google_event_id TEXT,
    outlook_event_id TEXT,
    meeting_url TEXT,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'canceled', 'rescheduled')),
    canceled_at DATETIME,
    canceled_by TEXT CHECK (canceled_by IN ('host', 'attendee')),
    cancellation_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_type_id) REFERENCES event_types(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_bookings_user_time ON bookings(user_id, start_time);
CREATE INDEX idx_bookings_event_type ON bookings(event_type_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_google_event ON bookings(google_event_id);

-- Cache control table (fallback when KV is unavailable)
CREATE TABLE IF NOT EXISTS cache_control (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cache_expires ON cache_control(expires_at);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    date DATE NOT NULL,
    endpoint TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    UNIQUE(date, endpoint)
);

CREATE INDEX idx_api_usage_date ON api_usage(date);

-- Sessions for auth
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL, -- JSON array of event types
    secret TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_webhooks_user ON webhooks(user_id);

-- Email templates and settings
CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    template_type TEXT NOT NULL CHECK (template_type IN ('confirmation', 'cancellation', 'reschedule', 'reminder_24h', 'reminder_1h', 'reminder_30m')),
    is_enabled BOOLEAN DEFAULT 1,
    subject TEXT,
    custom_message TEXT, -- Additional message to include in template
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, template_type)
);

CREATE INDEX idx_email_templates_user ON email_templates(user_id);

-- Scheduled emails for reminders
CREATE TABLE IF NOT EXISTS scheduled_emails (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    booking_id TEXT NOT NULL,
    template_type TEXT NOT NULL,
    scheduled_for DATETIME NOT NULL,
    sent_at DATETIME,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX idx_scheduled_emails_pending ON scheduled_emails(status, scheduled_for);
CREATE INDEX idx_scheduled_emails_booking ON scheduled_emails(booking_id);

-- Reschedule proposals for host-initiated reschedules
CREATE TABLE IF NOT EXISTS reschedule_proposals (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    booking_id TEXT NOT NULL,
    proposed_start_time DATETIME NOT NULL,
    proposed_end_time DATETIME NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'counter_proposed', 'expired')),
    proposed_by TEXT NOT NULL CHECK (proposed_by IN ('host', 'attendee')),
    response_token TEXT UNIQUE NOT NULL,
    responded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX idx_reschedule_proposals_booking ON reschedule_proposals(booking_id);
CREATE INDEX idx_reschedule_proposals_token ON reschedule_proposals(response_token);
CREATE INDEX idx_reschedule_proposals_status ON reschedule_proposals(status);

-- Views for common queries
CREATE VIEW IF NOT EXISTS active_event_types AS
SELECT * FROM event_types WHERE is_active = 1;

CREATE VIEW IF NOT EXISTS upcoming_bookings AS
SELECT * FROM bookings 
WHERE status = 'confirmed' 
AND start_time > CURRENT_TIMESTAMP 
ORDER BY start_time;