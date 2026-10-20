/**
 * Google OAuth login initiation
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUrl, getCurrentUser } from '$lib/server/auth';
import { isAccessConfigured } from '$lib/server/access';

export const GET: RequestHandler = async (event) => {
	const { platform, url } = event;
	const env = platform?.env;
	if (!env) {
		throw new Error('Platform env not available');
	}

	// Behind Cloudflare Access the identity is already verified: skip the Google round trip
	if (isAccessConfigured(env) && (await getCurrentUser(event))) {
		throw redirect(302, '/dashboard');
	}

	const clientId = env.GOOGLE_CLIENT_ID;
	const appUrl = env.APP_URL;

	if (!clientId || !appUrl) {
		throw new Error('Missing OAuth configuration');
	}

	// Generate state token for CSRF protection
	const state = crypto.randomUUID();

	// Store state in KV for verification (expires in 10 minutes)
	await env.KV.put(`oauth_state:${state}`, '1', { expirationTtl: 600 });

	const redirectUri = `${appUrl}/auth/callback`;
	const authUrl = getAuthUrl(clientId, redirectUri, state);

	throw redirect(302, authUrl);
};
