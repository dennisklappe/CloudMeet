/**
 * Busy times from the connected calendars and existing bookings
 */

import { getBusyTimes, getValidAccessToken } from './google-calendar';
import { getOutlookBusyTimes, getValidOutlookAccessToken } from './outlook-calendar';
import type { TimeSlot } from './slots';

export interface BusyEnv {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	MICROSOFT_CLIENT_ID?: string;
	MICROSOFT_CLIENT_SECRET?: string;
}

export interface UserCalendarSettings {
	defaultAvailabilityCalendars?: string;
	selectedGoogleCalendars?: string[];
}

export function parseUserSettings<T extends object = UserCalendarSettings & Record<string, unknown>>(
	raw: string | null
): T {
	try {
		return raw ? JSON.parse(raw) : ({} as T);
	} catch {
		return {} as T;
	}
}

/**
 * Busy times between from and to. A calendar that fails to load is skipped,
 * so a provider outage never blocks the booking page.
 */
export async function loadBusyTimes(
	env: BusyEnv,
	db: D1Database,
	userId: string,
	settings: UserCalendarSettings,
	eventAvailabilityCalendars: string | null,
	from: Date,
	to: Date
): Promise<TimeSlot[]> {
	const calendars = eventAvailabilityCalendars || settings.defaultAvailabilityCalendars || 'both';
	const busy: TimeSlot[] = [];

	if (calendars === 'google' || calendars === 'both') {
		try {
			const accessToken = await getValidAccessToken(db, userId, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
			// Use selected calendars if configured, otherwise query all
			busy.push(...(await getBusyTimes(accessToken, from, to, settings.selectedGoogleCalendars)));
		} catch (err) {
			console.error('Error fetching Google Calendar busy times:', err);
		}
	}

	if ((calendars === 'outlook' || calendars === 'both') && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
		try {
			const token = await getValidOutlookAccessToken(db, userId, env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET);
			busy.push(...(await getOutlookBusyTimes(token, from, to)));
		} catch (err) {
			// The user may not have Outlook connected
			console.error('Error fetching Outlook Calendar busy times:', err);
		}
	}

	const bookings = await db
		.prepare(
			`SELECT start_time, end_time
			FROM bookings
			WHERE user_id = ? AND start_time >= ? AND start_time < ? AND status = 'confirmed'`
		)
		.bind(userId, from.toISOString(), to.toISOString())
		.all<{ start_time: string; end_time: string }>();

	return [...busy, ...(bookings.results ?? []).map((b) => ({ start: b.start_time, end: b.end_time }))];
}
