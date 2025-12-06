/**
 * Disconnect Outlook calendar
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCurrentUser } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
	const env = event.platform?.env;
	if (!env) {
		throw redirect(302, '/dashboard?error=server_error');
	}

	const userId = await getCurrentUser(event);
	if (!userId) {
		throw redirect(302, '/auth/login');
	}

	// Remove Outlook refresh token
	const db = env.DB;
	await db
		.prepare('UPDATE users SET outlook_refresh_token = NULL WHERE id = ?')
		.bind(userId)
		.run();

	throw redirect(302, '/dashboard?success=outlook_disconnected');
};
