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
import { loadBusyTimes, parseUserSettings } from '$lib/server/busy';
import { generateSlots, loadRulesByDay, resolveEventLimits } from '$lib/server/slots';

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
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
		throw error(400, 'Invalid date');
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

		const userSettings = parseUserSettings(user.settings);

		const eventType = await db
			.prepare(
				`SELECT id, duration_minutes as duration, availability_calendars,
					buffer_minutes, min_notice_minutes, max_advance_days
				FROM event_types WHERE user_id = ? AND slug = ? AND is_active = 1`
			)
			.bind(user.id, eventSlug)
			.first<{
				id: string;
				duration: number;
				availability_calendars: string | null;
				buffer_minutes: number | null;
				min_notice_minutes: number | null;
				max_advance_days: number | null;
			}>();

		if (!eventType) {
			throw error(404, 'Event type not found or inactive');
		}

		// Parse date
		const requestedDate = new Date(date);
		const dayOfWeek = requestedDate.getDay();

		// Get availability rules for this day (event specific hours, else the global schedule)
		const rulesByDay = await loadRulesByDay(db, user.id, eventType.id);
		const availabilityRules = rulesByDay.get(dayOfWeek) ?? [];

		if (availabilityRules.length === 0) {
			return json({ slots: [] });
		}

		// Get busy times from connected calendars. The window is a day wider on both
		// sides because the host's local day does not line up with the UTC day.
		const startOfDay = new Date(requestedDate.getTime() - 24 * 60 * 60 * 1000);
		const endOfDay = new Date(requestedDate.getTime() + 48 * 60 * 60 * 1000);

		const allBusySlots = await loadBusyTimes(
			env,
			db,
			user.id,
			userSettings,
			eventType.availability_calendars,
			startOfDay,
			endOfDay
		);

		// Generate available slots
		const slots = generateSlots({
			dateStr: date,
			rules: availabilityRules,
			durationMinutes: eventType.duration,
			timezone: userTimezone,
			busy: allBusySlots,
			limits: resolveEventLimits(eventType)
		});

		// Cache response in KV for 5 minutes
		await env.KV.put(cacheKey, JSON.stringify({ slots }), { expirationTtl: 300 });

		return json({ slots });
	} catch (err: any) {
		console.error('Availability API error:', err);
		if (err?.status) throw err; // Re-throw SvelteKit errors
		throw error(500, 'Failed to fetch availability');
	}
};
