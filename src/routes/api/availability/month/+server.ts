/**
 * Monthly availability API endpoint
 * Returns which dates in a month have available slots
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBusyTimes, getValidAccessToken } from '$lib/server/google-calendar';
import { getOutlookBusyTimes, getValidOutlookAccessToken } from '$lib/server/outlook-calendar';

interface TimeSlot {
	start: string;
	end: string;
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const eventSlug = url.searchParams.get('event');
	const month = url.searchParams.get('month'); // YYYY-MM

	if (!eventSlug || !month) {
		throw error(400, 'Missing required parameters');
	}

	try {
		const db = env.DB;

		// Check cache first to avoid expensive DB/API calls
		const cacheKey = `availability:month:${eventSlug}:${month}`;
		const cached = await env.KV.get(cacheKey);
		if (cached) {
			return json(JSON.parse(cached));
		}

		// Get the first (and only) user for single-user setup
		const user = await db
			.prepare('SELECT id, slug, timezone, settings FROM users LIMIT 1')
			.first<{ id: string; slug: string; timezone: string | null; settings: string | null }>();

		if (!user) {
			throw error(404, 'User not found');
		}

		const userTimezone = user.timezone || 'UTC';

		// Parse user settings for global calendar defaults
		let userSettings: { defaultAvailabilityCalendars?: string; selectedGoogleCalendars?: string[] } = {};
		try {
			userSettings = user.settings ? JSON.parse(user.settings) : {};
		} catch {
			userSettings = {};
		}

		// Helper to create a Date in user's timezone
		function createDateInTimezone(dateStr: string, timeStr: string, timezone: string): Date {
			const [hour, minute] = timeStr.split(':').map(Number);
			const dateTimeStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

			const formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			});

			const targetDate = new Date(dateTimeStr + 'Z');
			const parts = formatter.formatToParts(targetDate);
			const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
			const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

			const targetMinutes = hour * 60 + minute;
			const actualMinutes = tzHour * 60 + tzMinute;
			let offsetMinutes = actualMinutes - targetMinutes;

			if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
			if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;

			return new Date(targetDate.getTime() - offsetMinutes * 60 * 1000);
		}

		const eventType = await db
			.prepare('SELECT id, duration_minutes as duration, availability_calendars FROM event_types WHERE user_id = ? AND slug = ? AND is_active = 1')
			.bind(user.id, eventSlug)
			.first<{ id: string; duration: number; availability_calendars: string | null }>();

		if (!eventType) {
			throw error(404, 'Event type not found or inactive');
		}

		// Get calendar settings: use event type override if set, otherwise use global settings
		const availabilityCalendars = eventType.availability_calendars || userSettings.defaultAvailabilityCalendars || 'both';
		const useGoogleCalendar = availabilityCalendars === 'google' || availabilityCalendars === 'both';
		const useOutlookCalendar = availabilityCalendars === 'outlook' || availabilityCalendars === 'both';

		// Get all availability rules for this user
		const allRules = await db
			.prepare(
				`SELECT day_of_week, start_time, end_time
				FROM availability_rules
				WHERE user_id = ?
				ORDER BY day_of_week, start_time`
			)
			.bind(user.id)
			.all<{ day_of_week: number; start_time: string; end_time: string }>();

		// Group rules by day of week
		const rulesByDay = new Map<number, Array<{ start_time: string; end_time: string }>>();
		for (const rule of allRules.results || []) {
			if (!rulesByDay.has(rule.day_of_week)) {
				rulesByDay.set(rule.day_of_week, []);
			}
			rulesByDay.get(rule.day_of_week)!.push({ start_time: rule.start_time, end_time: rule.end_time });
		}

		// Parse month to get date range
		const [year, monthNum] = month.split('-').map(Number);
		const firstDay = new Date(year, monthNum - 1, 1);
		const lastDay = new Date(year, monthNum, 0);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Max date is 60 days from today
		const maxDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);

		// Get busy times from connected calendars for the entire month
		let busySlots: TimeSlot[] = [];

		// Fetch Google Calendar busy times (if enabled)
		if (useGoogleCalendar) {
			try {
				const accessToken = await getValidAccessToken(
					db,
					user.id,
					env.GOOGLE_CLIENT_ID,
					env.GOOGLE_CLIENT_SECRET
				);
				// Use selected calendars if configured, otherwise query all
				const selectedCalendars = userSettings.selectedGoogleCalendars;
				const googleBusy = await getBusyTimes(accessToken, firstDay, lastDay, selectedCalendars);
				busySlots.push(...googleBusy);
			} catch (err) {
				console.error('Error fetching Google Calendar busy times:', err);
			}
		}

		// Fetch Outlook Calendar busy times (if enabled and configured)
		if (useOutlookCalendar && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
			try {
				const outlookToken = await getValidOutlookAccessToken(
					db,
					user.id,
					env.MICROSOFT_CLIENT_ID,
					env.MICROSOFT_CLIENT_SECRET
				);
				const outlookBusy = await getOutlookBusyTimes(outlookToken, firstDay, lastDay);
				busySlots.push(...outlookBusy);
			} catch (err) {
				console.error('Error fetching Outlook Calendar busy times:', err);
			}
		}

		// Get existing bookings for this month
		const bookings = await db
			.prepare(
				`SELECT start_time, end_time
				FROM bookings
				WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND status = 'confirmed'
				ORDER BY start_time`
			)
			.bind(user.id, firstDay.toISOString(), lastDay.toISOString())
			.all<{ start_time: string; end_time: string }>();

		// Combine all busy slots
		const allBusySlots = [
			...busySlots,
			...bookings.results.map(b => ({ start: b.start_time, end: b.end_time }))
		];

		// Check each day in the month
		const availableDates: string[] = [];

		for (let day = 1; day <= lastDay.getDate(); day++) {
			const date = new Date(year, monthNum - 1, day);

			// Skip dates before today or after maxDate
			if (date < today || date > maxDate) continue;

			const dayOfWeek = date.getDay();
			const rules = rulesByDay.get(dayOfWeek);

			// No availability rules for this day
			if (!rules || rules.length === 0) continue;

			// Check if at least one slot is available
			const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
			let hasAvailableSlot = false;

			for (const rule of rules) {
				if (hasAvailableSlot) break;

				// Create start and end times in user's timezone, converted to UTC
				let currentTime = createDateInTimezone(dateStr, rule.start_time, userTimezone);
				const endTime = createDateInTimezone(dateStr, rule.end_time, userTimezone);

				const slotIncrement = Math.min(30, eventType.duration);

				while (currentTime < endTime && !hasAvailableSlot) {
					const slotEnd = new Date(currentTime);
					slotEnd.setMinutes(slotEnd.getMinutes() + eventType.duration);

					if (slotEnd > endTime) break;
					if (currentTime < new Date()) {
						currentTime.setMinutes(currentTime.getMinutes() + slotIncrement);
						continue;
					}

					// Check conflicts
					const hasConflict = allBusySlots.some(busy => {
						const busyStart = new Date(busy.start);
						const busyEnd = new Date(busy.end);
						return (
							(currentTime >= busyStart && currentTime < busyEnd) ||
							(slotEnd > busyStart && slotEnd <= busyEnd) ||
							(currentTime <= busyStart && slotEnd >= busyEnd)
						);
					});

					if (!hasConflict) {
						hasAvailableSlot = true;
					}

					currentTime.setMinutes(currentTime.getMinutes() + slotIncrement);
				}
			}

			if (hasAvailableSlot) {
				availableDates.push(dateStr);
			}
		}

		// Cache response in KV for 5 minutes
		await env.KV.put(cacheKey, JSON.stringify({ availableDates }), { expirationTtl: 300 });

		return json({ availableDates });
	} catch (err: any) {
		console.error('Monthly availability API error:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to fetch monthly availability');
	}
};
