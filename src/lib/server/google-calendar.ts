/**
 * Google Calendar API integration
 * Uses REST API directly (no googleapis library) for Cloudflare Workers compatibility
 */

export interface CalendarEvent {
	id: string;
	summary: string;
	start: { dateTime: string; timeZone?: string };
	end: { dateTime: string; timeZone?: string };
	status: string;
	hangoutLink?: string;
	htmlLink?: string;
}

export interface BusySlot {
	start: string; // ISO 8601
	end: string; // ISO 8601
}

export interface FreeBusyResponse {
	calendars: {
		[calendarId: string]: {
			busy: Array<{
				start: string;
				end: string;
			}>;
		};
	};
}

export interface CalendarListEntry {
	id: string;
	summary: string;
	primary?: boolean;
	accessRole: string;
}

/**
 * List all calendars the user has access to
 */
export async function listCalendars(accessToken: string): Promise<CalendarListEntry[]> {
	const calendars: CalendarListEntry[] = [];
	let pageToken: string | undefined;

	do {
		const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
		url.searchParams.set('minAccessRole', 'freeBusyReader');
		if (pageToken) {
			url.searchParams.set('pageToken', pageToken);
		}

		const response = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to list calendars: ${error}`);
		}

		const data = await response.json() as {
			items?: CalendarListEntry[];
			nextPageToken?: string;
		};

		if (data.items) {
			calendars.push(...data.items);
		}
		pageToken = data.nextPageToken;
	} while (pageToken);

	return calendars;
}

/**
 * Get user's busy times from Google Calendar
 * Queries all accessible calendars by default for complete availability
 */
export async function getBusyTimes(
	accessToken: string,
	startDate: Date,
	endDate: Date,
	calendarIds?: string[]
): Promise<BusySlot[]> {
	// If no calendar IDs provided, fetch all calendars
	let idsToQuery = calendarIds;
	if (!idsToQuery || idsToQuery.length === 0) {
		const calendars = await listCalendars(accessToken);
		idsToQuery = calendars.map(c => c.id);
	}

	// FreeBusy API can query multiple calendars at once
	const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			timeMin: startDate.toISOString(),
			timeMax: endDate.toISOString(),
			items: idsToQuery.map(id => ({ id }))
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to fetch busy times: ${error}`);
	}

	const data: FreeBusyResponse = await response.json();

	// Aggregate busy times from all calendars
	const allBusy: BusySlot[] = [];
	for (const calendarId of idsToQuery) {
		const busy = data.calendars[calendarId]?.busy || [];
		allBusy.push(...busy);
	}

	// Sort and merge overlapping busy slots
	return mergeBusySlots(allBusy);
}

/**
 * Merge overlapping busy slots into non-overlapping ranges
 */
function mergeBusySlots(slots: BusySlot[]): BusySlot[] {
	if (slots.length === 0) return [];

	// Sort by start time
	const sorted = [...slots].sort((a, b) =>
		new Date(a.start).getTime() - new Date(b.start).getTime()
	);

	const merged: BusySlot[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const last = merged[merged.length - 1];

		// If current overlaps or is adjacent to last, merge them
		if (new Date(current.start) <= new Date(last.end)) {
			last.end = new Date(current.end) > new Date(last.end) ? current.end : last.end;
		} else {
			merged.push(current);
		}
	}

	return merged;
}

/**
 * Create a calendar event (for bookings)
 */
export async function createCalendarEvent(
	accessToken: string,
	event: {
		summary: string;
		description?: string;
		start: { dateTime: string; timeZone: string };
		end: { dateTime: string; timeZone: string };
		attendees?: Array<{ email: string }>;
		conferenceData?: {
			createRequest: {
				requestId: string;
				conferenceSolutionKey: { type: string };
			};
		};
	},
	calendarId: string = 'primary'
): Promise<CalendarEvent> {
	const response = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(event)
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to create calendar event: ${error}`);
	}

	return response.json();
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
	accessToken: string,
	eventId: string,
	updates: Partial<{
		summary: string;
		description: string;
		start: { dateTime: string; timeZone: string };
		end: { dateTime: string; timeZone: string };
		status: string;
	}>,
	calendarId: string = 'primary'
): Promise<CalendarEvent> {
	const response = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
		{
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(updates)
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to update calendar event: ${error}`);
	}

	return response.json();
}

/**
 * Cancel a calendar event (for cancellations)
 */
export async function cancelCalendarEvent(
	accessToken: string,
	eventId: string,
	calendarId: string = 'primary'
): Promise<void> {
	const response = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
		{
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to cancel calendar event: ${error}`);
	}
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getValidAccessToken(
	db: D1Database,
	userId: string,
	clientId: string,
	clientSecret: string
): Promise<string> {
	// Get user's tokens from database
	const user = await db
		.prepare('SELECT google_refresh_token FROM users WHERE id = ?')
		.bind(userId)
		.first<{
			google_refresh_token: string | null;
		}>();

	if (!user?.google_refresh_token) {
		throw new Error('User not connected to Google Calendar');
	}

	// Refresh access token to get a fresh one
	const { refreshAccessToken } = await import('./auth.js');
	const tokens = await refreshAccessToken(user.google_refresh_token, clientId, clientSecret);

	return tokens.access_token;
}
