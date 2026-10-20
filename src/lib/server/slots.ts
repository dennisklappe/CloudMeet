/**
 * Slot generation shared by the availability endpoints and booking validation
 */

export interface TimeSlot {
	start: string;
	end: string;
}

export interface AvailabilityRule {
	day_of_week: number;
	start_time: string;
	end_time: string;
}

export interface EventLimits {
	bufferMinutes: number;
	minNoticeMinutes: number;
	maxAdvanceDays: number;
}

export const DEFAULT_MAX_ADVANCE_DAYS = 60;

const MINUTE_MS = 60 * 1000;

/**
 * Per-event limits. NULL columns fall back to the defaults.
 */
export function resolveEventLimits(eventType: {
	buffer_minutes?: number | null;
	min_notice_minutes?: number | null;
	max_advance_days?: number | null;
}): EventLimits {
	return {
		bufferMinutes: Math.max(0, eventType.buffer_minutes ?? 0),
		minNoticeMinutes: Math.max(0, eventType.min_notice_minutes ?? 0),
		maxAdvanceDays: eventType.max_advance_days ?? DEFAULT_MAX_ADVANCE_DAYS
	};
}

/**
 * Weekly rules for an event type: its own hours when it has any,
 * otherwise the global schedule (rules without an event type).
 */
export async function loadRulesByDay(
	db: D1Database,
	userId: string,
	eventTypeId: string
): Promise<Map<number, AvailabilityRule[]>> {
	const query = (where: string, ...binds: string[]) =>
		db
			.prepare(
				`SELECT day_of_week, start_time, end_time
				FROM availability_rules
				WHERE user_id = ? AND is_active = 1 AND ${where}
				ORDER BY day_of_week, start_time`
			)
			.bind(userId, ...binds)
			.all<AvailabilityRule>();

	let rules = await query('event_type_id = ?', eventTypeId);
	if (!rules.results?.length) {
		rules = await query('event_type_id IS NULL');
	}

	const byDay = new Map<number, AvailabilityRule[]>();
	for (const rule of rules.results || []) {
		const list = byDay.get(rule.day_of_week) ?? [];
		list.push(rule);
		byDay.set(rule.day_of_week, list);
	}
	return byDay;
}

/**
 * Convert a wall clock time (YYYY-MM-DD, HH:MM) in the given timezone to a UTC Date
 */
export function createDateInTimezone(dateStr: string, timeStr: string, timezone: string): Date {
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

	// Start with a UTC interpretation and correct it by the timezone offset
	const targetDate = new Date(dateTimeStr + 'Z');
	const parts = formatter.formatToParts(targetDate);
	const tzHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
	const tzMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');

	let offsetMinutes = tzHour * 60 + tzMinute - (hour * 60 + minute);

	// Handle day boundary crossing
	if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
	if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;

	return new Date(targetDate.getTime() - offsetMinutes * MINUTE_MS);
}

/**
 * Generate the free slots for one date. Busy times are widened by the
 * event buffer on both sides, slots inside the minimum notice or beyond the
 * booking window are dropped.
 */
export function generateSlots(options: {
	dateStr: string;
	rules: AvailabilityRule[];
	durationMinutes: number;
	timezone: string;
	busy: TimeSlot[];
	limits: EventLimits;
	now?: Date;
	stopAtFirst?: boolean;
}): TimeSlot[] {
	const { dateStr, rules, durationMinutes, timezone, busy, limits, stopAtFirst } = options;
	const now = options.now ?? new Date();

	const earliest = now.getTime() + limits.minNoticeMinutes * MINUTE_MS;
	const latest = now.getTime() + limits.maxAdvanceDays * 24 * 60 * MINUTE_MS;
	const bufferMs = limits.bufferMinutes * MINUTE_MS;

	const busyRanges = busy.map((b) => ({
		start: new Date(b.start).getTime() - bufferMs,
		end: new Date(b.end).getTime() + bufferMs
	}));

	const slots: TimeSlot[] = [];
	// Slots start every 30 minutes (or the event duration, whichever is smaller)
	const stepMs = Math.min(30, durationMinutes) * MINUTE_MS;
	const durationMs = durationMinutes * MINUTE_MS;

	for (const rule of rules) {
		const windowEnd = createDateInTimezone(dateStr, rule.end_time, timezone).getTime();

		for (
			let start = createDateInTimezone(dateStr, rule.start_time, timezone).getTime();
			start + durationMs <= windowEnd;
			start += stepMs
		) {
			if (start < earliest || start > latest) continue;

			const end = start + durationMs;
			if (busyRanges.some((b) => start < b.end && end > b.start)) continue;

			slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
			if (stopAtFirst) return slots;
		}
	}

	return slots;
}
