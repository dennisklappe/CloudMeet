/**
 * Monthly availability API endpoint
 * Returns which dates in a month have available slots
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
	const month = url.searchParams.get('month'); // YYYY-MM

	if (!eventSlug || !month) {
		throw error(400, 'Missing required parameters');
	}
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
		throw error(400, 'Invalid month');
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

		// Event specific hours, else the global schedule
		const rulesByDay = await loadRulesByDay(db, user.id, eventType.id);
		const limits = resolveEventLimits(eventType);

		// Parse month to get date range
		const [year, monthNum] = month.split('-').map(Number);
		const firstDay = new Date(year, monthNum - 1, 1);
		const lastDay = new Date(year, monthNum, 0);
		// Busy times are fetched until the end of the last day, with a day of slack for timezone offsets
		const rangeStart = new Date(firstDay.getTime() - 24 * 60 * 60 * 1000);
		const rangeEnd = new Date(lastDay.getTime() + 48 * 60 * 60 * 1000);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const allBusySlots = await loadBusyTimes(
			env,
			db,
			user.id,
			userSettings,
			eventType.availability_calendars,
			rangeStart,
			rangeEnd
		);

		// Check each day in the month
		const availableDates: string[] = [];

		for (let day = 1; day <= lastDay.getDate(); day++) {
			const date = new Date(year, monthNum - 1, day);

			// Skip dates before today
			if (date < today) continue;

			const rules = rulesByDay.get(date.getDay());
			if (!rules || rules.length === 0) continue;

			// Check if at least one slot is available
			const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
			const slots = generateSlots({
				dateStr,
				rules,
				durationMinutes: eventType.duration,
				timezone: userTimezone,
				busy: allBusySlots,
				limits,
				stopAtFirst: true
			});

			if (slots.length > 0) {
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
