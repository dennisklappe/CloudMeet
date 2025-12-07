/**
 * API endpoint to list user's Google calendars
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCurrentUser } from '$lib/server/auth';
import { getValidAccessToken, listCalendars } from '$lib/server/google-calendar';

export const GET: RequestHandler = async (event) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const env = event.platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	try {
		const accessToken = await getValidAccessToken(
			env.DB,
			userId,
			env.GOOGLE_CLIENT_ID,
			env.GOOGLE_CLIENT_SECRET
		);

		const calendars = await listCalendars(accessToken);

		// Return calendars sorted with primary first
		const sorted = calendars.sort((a, b) => {
			if (a.primary) return -1;
			if (b.primary) return 1;
			return a.summary.localeCompare(b.summary);
		});

		return json({ calendars: sorted });
	} catch (err) {
		console.error('Failed to list Google calendars:', err);
		throw error(500, 'Failed to list calendars');
	}
};
