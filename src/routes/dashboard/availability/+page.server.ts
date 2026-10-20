/**
 * Availability settings page
 */

import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getCurrentUser } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	const userId = await getCurrentUser(event);

	if (!userId) {
		throw redirect(302, '/auth/login');
	}

	const db = event.platform?.env?.DB;
	if (!db) {
		throw new Error('Database not available');
	}

	// Get existing availability rules
	const rules = await db
		.prepare(
			`SELECT id, day_of_week, start_time, end_time
			FROM availability_rules
			WHERE user_id = ? AND event_type_id IS NULL
			ORDER BY day_of_week, start_time`
		)
		.bind(userId)
		.all<{
			id: number;
			day_of_week: number;
			start_time: string;
			end_time: string;
		}>();

	// Get user's timezone
	const user = await db
		.prepare('SELECT timezone FROM users WHERE id = ?')
		.bind(userId)
		.first<{ timezone: string | null }>();

	return {
		rules: rules.results,
		timezone: user?.timezone || 'UTC'
	};
};

export const actions: Actions = {
	save: async (event) => {
		const userId = await getCurrentUser(event);

		if (!userId) {
			throw redirect(302, '/auth/login');
		}

		const db = event.platform?.env?.DB;
		if (!db) {
			return fail(500, { error: 'Database not available' });
		}

		const formData = await event.request.formData();
		const rulesJson = formData.get('rules');
		const timezone = formData.get('timezone');

		if (!rulesJson || typeof rulesJson !== 'string') {
			return fail(400, { error: 'Invalid rules data' });
		}

		try {
			const rules = JSON.parse(rulesJson);

			// Update user's timezone if provided
			if (timezone && typeof timezone === 'string') {
				await db
					.prepare('UPDATE users SET timezone = ? WHERE id = ?')
					.bind(timezone, userId)
					.run();
			}

			// Delete existing rules
			await db
				.prepare('DELETE FROM availability_rules WHERE user_id = ? AND event_type_id IS NULL')
				.bind(userId)
				.run();

			// Insert new rules
			for (const rule of rules) {
				if (!rule.enabled) continue;

				await db
					.prepare(
						`INSERT INTO availability_rules (user_id, day_of_week, start_time, end_time)
						VALUES (?, ?, ?, ?)`
					)
					.bind(userId, rule.day, rule.startTime, rule.endTime)
					.run();
			}

			return { success: true };
		} catch (error) {
			console.error('Error saving availability:', error);
			return fail(500, { error: 'Failed to save availability rules' });
		}
	}
};
