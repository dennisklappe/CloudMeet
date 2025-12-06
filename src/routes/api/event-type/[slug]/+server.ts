/**
 * Event Type API endpoint (single-user)
 * Returns event type data by slug
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const slug = params.slug;
	const db = env.DB;

	try {
		// Get the first (and only) user
		const user = await db
			.prepare('SELECT id, slug, name, profile_image, brand_color, settings, outlook_refresh_token FROM users LIMIT 1')
			.first<{ id: string; slug: string; name: string; profile_image: string | null; brand_color: string | null; settings: string | null; outlook_refresh_token: string | null }>();

		if (!user) {
			throw error(404, 'User not found');
		}

		// Get event type
		const eventType = await db
			.prepare(
				'SELECT id, name, slug, duration_minutes as duration, description, is_active, cover_image, invite_calendar FROM event_types WHERE user_id = ? AND slug = ? AND is_active = 1'
			)
			.bind(user.id, slug)
			.first<{
				id: string;
				name: string;
				slug: string;
				duration: number;
				description: string;
				is_active: number;
				cover_image: string | null;
				invite_calendar: string | null;
			}>();

		if (!eventType) {
			throw error(404, 'Event type not found or inactive');
		}

		// Parse user settings
		let userSettings: { timeFormat?: string; defaultInviteCalendar?: string } = {};
		try {
			userSettings = user.settings ? JSON.parse(user.settings) : {};
		} catch {}

		// Determine effective invite calendar: use event type override if set, otherwise use global settings
		// Fall back to Google if Outlook not available
		const outlookConnected = !!user.outlook_refresh_token;
		const outlookConfigured = !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
		let effectiveInviteCalendar = eventType.invite_calendar || userSettings.defaultInviteCalendar || 'google';
		if (effectiveInviteCalendar === 'outlook' && (!outlookConnected || !outlookConfigured)) {
			effectiveInviteCalendar = 'google';
		}

		return json({
			slug: eventType.slug,
			eventType: {
				...eventType,
				invite_calendar: effectiveInviteCalendar // Return the effective calendar, not the stored one
			},
			user: {
				name: user.name,
				profileImage: user.profile_image,
				brandColor: user.brand_color || '#3b82f6',
				timeFormat: userSettings.timeFormat || '12h'
			}
		});
	} catch (err: any) {
		console.error('Event type API error:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to fetch event type');
	}
};
