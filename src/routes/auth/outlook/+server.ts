/**
 * Outlook OAuth login endpoint
 * Connects Outlook calendar to existing account (user must already be logged in via Google)
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOutlookAuthUrl } from '$lib/server/outlook-calendar';
import { getCurrentUser } from '$lib/server/auth';

export const GET: RequestHandler = async (event) => {
	const env = event.platform?.env;
	if (!env?.MICROSOFT_CLIENT_ID) {
		throw redirect(302, '/dashboard?error=outlook_not_configured');
	}

	// User must be logged in to connect Outlook
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw redirect(302, '/auth/login');
	}

	// Generate state token for CSRF protection (include userId)
	const state = `${crypto.randomUUID()}_${userId}`;

	// Store state in KV for verification
	await env.KV.put(`outlook_oauth_state:${state}`, userId, { expirationTtl: 600 });

	const redirectUri = `${env.APP_URL}/auth/outlook/callback`;
	const authUrl = getOutlookAuthUrl(env.MICROSOFT_CLIENT_ID, redirectUri, state);

	throw redirect(302, authUrl);
};
