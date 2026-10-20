/**
 * Per-event-type overrides: booking limits and custom weekly hours
 */

export interface EventHours {
	day: number;
	startTime: string;
	endTime: string;
}

export interface EventOverrides {
	bufferMinutes: number;
	minNoticeMinutes: number | null;
	maxAdvanceDays: number | null;
	/** null = follow the global schedule */
	hours: EventHours[] | null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function optionalInt(value: FormDataEntryValue | null, label: string, max: number): number | null | Error {
	if (value === null || value.toString().trim() === '') return null;
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0 || n > max) {
		return new Error(`${label} must be a whole number between 0 and ${max}`);
	}
	return n;
}

export function parseEventOverrides(formData: FormData): EventOverrides | { error: string } {
	const buffer = optionalInt(formData.get('buffer_minutes'), 'Buffer', 240);
	const notice = optionalInt(formData.get('min_notice_minutes'), 'Minimum notice', 60 * 24 * 90);
	const advance = optionalInt(formData.get('max_advance_days'), 'Booking window', 365);
	for (const value of [buffer, notice, advance]) {
		if (value instanceof Error) return { error: value.message };
	}

	let hours: EventHours[] | null = null;
	if (formData.get('custom_hours') === 'on') {
		try {
			const parsed = JSON.parse(formData.get('hours_json')?.toString() || '[]') as Array<EventHours & { enabled?: boolean }>;
			hours = parsed.filter((h) => h.enabled !== false);
			for (const h of hours) {
				if (!Number.isInteger(h.day) || h.day < 0 || h.day > 6) return { error: 'Invalid day in custom hours' };
				if (!TIME_PATTERN.test(h.startTime) || !TIME_PATTERN.test(h.endTime) || h.startTime >= h.endTime) {
					return { error: 'Custom hours need a start time before the end time' };
				}
			}
		} catch {
			return { error: 'Invalid custom hours' };
		}
	}

	return {
		bufferMinutes: (buffer as number | null) ?? 0,
		minNoticeMinutes: notice as number | null,
		maxAdvanceDays: advance as number | null,
		hours
	};
}

/**
 * Replace the event type's own weekly hours. Passing null removes them so the
 * event follows the global schedule again.
 */
export async function saveEventHours(
	db: D1Database,
	userId: string,
	eventTypeId: string,
	hours: EventHours[] | null
): Promise<void> {
	const statements = [
		db.prepare('DELETE FROM availability_rules WHERE user_id = ? AND event_type_id = ?').bind(userId, eventTypeId)
	];
	for (const h of hours ?? []) {
		statements.push(
			db
				.prepare(
					`INSERT INTO availability_rules (user_id, event_type_id, day_of_week, start_time, end_time)
					VALUES (?, ?, ?, ?, ?)`
				)
				.bind(userId, eventTypeId, h.day, h.startTime, h.endTime)
		);
	}
	await db.batch(statements);
}
