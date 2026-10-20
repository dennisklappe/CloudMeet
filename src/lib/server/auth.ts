/**
 * Server-side authentication utilities for Google OAuth
 * Single-user system - only the owner can log in
 */

import type { RequestEvent } from '@sveltejs/kit';
import { isAccessConfigured, verifyAccessJwt, getOrCreateAccessUser } from './access';

export interface GoogleTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
	scope: string;
}

export interface GoogleUserInfo {
	id: string;
	email: string;
	name: string;
	picture: string;
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthUrl(clientId: string, redirectUri: string, state: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: [
			'https://www.googleapis.com/auth/calendar',
			'https://www.googleapis.com/auth/calendar.events',
			'https://www.googleapis.com/auth/userinfo.email',
			'https://www.googleapis.com/auth/userinfo.profile'
		].join(' '),
		access_type: 'offline',
		prompt: 'consent',
		state
	});

	return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<GoogleTokenResponse> {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to exchange code for tokens: ${error}`);
	}

	return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string
): Promise<GoogleTokenResponse> {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'refresh_token'
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to refresh access token: ${error}`);
	}

	return response.json();
}

/**
 * Get user info from Google
 */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
	const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!response.ok) {
		throw new Error('Failed to get user info');
	}

	return response.json();
}

/**
 * Create session token (payload plus HMAC-SHA256 signature)
 */
export async function createSessionToken(
	userId: string,
	secret: string
): Promise<string> {
	const payload = {
		userId,
		iat: Date.now()
	};

	const data = btoa(JSON.stringify(payload));
	const signature = await sign(data, secret);

	return `${data}.${signature}`;
}

/**
 * Verify session token
 */
export async function verifySessionToken(
	token: string,
	secret: string
): Promise<{ userId: string } | null> {
	try {
		const [data, signature] = token.split('.');
		if (!data || !signature) {
			return null;
		}

		const expectedSignature = await sign(data, secret);
		if (!timingSafeEqual(signature, expectedSignature)) {
			return null;
		}

		const payload = JSON.parse(atob(data));

		// Check if token is expired (7 days - matches cookie maxAge)
		const age = Date.now() - payload.iat;
		if (age > 7 * 24 * 60 * 60 * 1000) {
			return null;
		}

		return { userId: payload.userId };
	} catch {
		return null;
	}
}

/**
 * Sign a string with HMAC-SHA256 using the Web Crypto API
 */
async function sign(data: string, secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
	return Array.from(new Uint8Array(signature))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Compare two strings without leaking where they differ
 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Get current user from the session cookie, or from Cloudflare Access
 * when CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are configured
 */
export async function getCurrentUser(
	event: RequestEvent
): Promise<string | null> {
	const env = event.platform?.env;

	const sessionToken = event.cookies.get('session');
	if (sessionToken && env?.JWT_SECRET) {
		const session = await verifySessionToken(sessionToken, env.JWT_SECRET);
		if (session) return session.userId;
	}

	if (env && isAccessConfigured(env)) {
		const accessToken = event.request.headers.get('Cf-Access-Jwt-Assertion');
		if (accessToken) {
			const identity = await verifyAccessJwt(accessToken, env);
			if (identity) return getOrCreateAccessUser(env.DB, identity);
		}
	}

	return null;
}

/**
 * Require authentication - redirect to login if not authenticated
 */
export async function requireAuth(event: RequestEvent): Promise<string> {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw new Error('Not authenticated');
	}
	return userId;
}
