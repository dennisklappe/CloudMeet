/**
 * Availability API endpoint
 * Returns available time slots based on:
 * 1. User's availability rules (weekly schedule)
 * 2. Google Calendar busy times
 * 3. Outlook Calendar busy times
 * 4. Existing bookings
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
	const date = url.searchParams.get('date'); // YYYY-MM-DD

	if (!eventSlug || !date) {
		throw error(400, 'Missing required parameters');
	}

	try {
		const db = env.DB;

		// Check cache first to avoid expensive DB/API calls
		const cacheKey = `availability:${eventSlug}:${date}`;
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

		// Parse date
		const requestedDate = new Date(date);
		const dayOfWeek = requestedDate.getDay();

		// Get availability rules for this day
		const availabilityRules = await db
			.prepare(
				`SELECT start_time, end_time
				FROM availability_rules
				WHERE user_id = ? AND day_of_week = ?
				ORDER BY start_time`
			)
			.bind(user.id, dayOfWeek)
			.all<{ start_time: string; end_time: string }>();

		if (!availabilityRules.results || availabilityRules.results.length === 0) {
			return json({ slots: [] });
		}

		// Get busy times from connected calendars
		const startOfDay = new Date(requestedDate);
		startOfDay.setHours(0, 0, 0, 0);
		const endOfDay = new Date(requestedDate);
		endOfDay.setHours(23, 59, 59, 999);

		let busySlots: TimeSlot[] = [];

		// Fetch Google Calendar busy times (if enabled in settings)
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
				const googleBusy = await getBusyTimes(accessToken, startOfDay, endOfDay, selectedCalendars);
				busySlots.push(...googleBusy);
			} catch (err) {
				console.error('Error fetching Google Calendar busy times:', err);
				// Continue without Google Calendar data if there's an error
			}
		}

		// Fetch Outlook Calendar busy times (if configured, connected, and enabled in settings)
		if (useOutlookCalendar && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
			try {
				const outlookToken = await getValidOutlookAccessToken(
					db,
					user.id,
					env.MICROSOFT_CLIENT_ID,
					env.MICROSOFT_CLIENT_SECRET
				);
				const outlookBusy = await getOutlookBusyTimes(outlookToken, startOfDay, endOfDay);
				busySlots.push(...outlookBusy);
			} catch (err) {
				// User may not have Outlook connected - that's fine
				console.error('Error fetching Outlook Calendar busy times:', err);
			}
		}

		// Get existing bookings for this date
		const bookings = await db
			.prepare(
				`SELECT start_time, end_time
				FROM bookings
				WHERE user_id = ? AND DATE(start_time) = ? AND status = 'confirmed'
				ORDER BY start_time`
			)
			.bind(user.id, date)
			.all<{ start_time: string; end_time: string }>();

		// Combine busy slots from Google Calendar and bookings
		const allBusySlots = [
			...busySlots.map(slot => ({
				start: slot.start,
				end: slot.end
			})),
			...bookings.results.map(booking => ({
				start: booking.start_time,
				end: booking.end_time
			}))
		];

		// Generate available slots
		const slots: TimeSlot[] = [];

		// Helper to create a Date in user's timezone
		// Takes a date string (YYYY-MM-DD) and time string (HH:MM) in user's timezone
		// and returns a UTC Date
		function createDateInTimezone(dateStr: string, timeStr: string, timezone: string): Date {
			const [hour, minute] = timeStr.split(':').map(Number);
			// Create a date string that represents the time in the user's timezone
			const dateTimeStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

			// Format the date in the target timezone to get the offset
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

			// Parse the target date/time and find the UTC equivalent
			// We need to find what UTC time corresponds to this local time
			const targetDate = new Date(dateTimeStr + 'Z'); // Start with UTC interpretation
			const utcStr = targetDate.toISOString();

			// Get what time it would be in the user's timezone if we used this UTC time
			const parts = formatter.formatToParts(targetDate);
			const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
			const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

			// Calculate the offset in minutes
			const targetMinutes = hour * 60 + minute;
			const actualMinutes = tzHour * 60 + tzMinute;
			let offsetMinutes = actualMinutes - targetMinutes;

			// Handle day boundary crossing
			if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
			if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;

			// Adjust to get the correct UTC time
			return new Date(targetDate.getTime() - offsetMinutes * 60 * 1000);
		}

		for (const rule of availabilityRules.results) {
			// Create start and end times in user's timezone, converted to UTC
			let currentTime = createDateInTimezone(date, rule.start_time, userTimezone);
			const endTime = createDateInTimezone(date, rule.end_time, userTimezone);

			// Generate slots every 30 minutes (or event duration, whichever is smaller)
			const slotIncrement = Math.min(30, eventType.duration);

			while (currentTime < endTime) {
				const slotEnd = new Date(currentTime);
				slotEnd.setMinutes(slotEnd.getMinutes() + eventType.duration);

				// Check if slot end is within availability window
				if (slotEnd > endTime) {
					break;
				}

				// Check if slot is in the past
				if (currentTime < new Date()) {
					currentTime.setMinutes(currentTime.getMinutes() + slotIncrement);
					continue;
				}

				// Check if slot conflicts with any busy time
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
					slots.push({
						start: currentTime.toISOString(),
						end: slotEnd.toISOString()
					});
				}

				currentTime.setMinutes(currentTime.getMinutes() + slotIncrement);
			}
		}

		// Cache response in KV for 5 minutes
		await env.KV.put(cacheKey, JSON.stringify({ slots }), { expirationTtl: 300 });

		return json({ slots });
	} catch (err: any) {
		console.error('Availability API error:', err);
		if (err?.status) throw err; // Re-throw SvelteKit errors
		throw error(500, 'Failed to fetch availability');
	}
};
