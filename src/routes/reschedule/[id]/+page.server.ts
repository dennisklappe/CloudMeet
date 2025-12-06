/**
 * Reschedule booking page
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env?.DB;
	const env = platform?.env;
	if (!db || !env) {
		throw error(500, 'Database not available');
	}

	const bookingId = params.id;

	// Get booking details including event type and user settings
	const booking = await db
		.prepare(
			`SELECT b.id, b.start_time, b.end_time, b.attendee_name, b.attendee_email, b.attendee_notes,
			b.status, e.id as event_type_id, e.name as event_name, e.slug as event_slug,
			e.duration_minutes as duration, e.description, e.cover_image, e.invite_calendar,
			u.name as host_name, u.profile_image, u.brand_color, u.settings
			FROM bookings b
			JOIN event_types e ON b.event_type_id = e.id
			JOIN users u ON b.user_id = u.id
			WHERE b.id = ?`
		)
		.bind(bookingId)
		.first<{
			id: string;
			start_time: string;
			end_time: string;
			attendee_name: string;
			attendee_email: string;
			attendee_notes: string | null;
			status: string;
			event_type_id: string;
			event_name: string;
			event_slug: string;
			duration: number;
			description: string | null;
			cover_image: string | null;
			invite_calendar: string | null;
			host_name: string;
			profile_image: string | null;
			brand_color: string | null;
			settings: string | null;
		}>();

	if (!booking) {
		throw error(404, 'Booking not found');
	}

	if (booking.status === 'canceled') {
		throw error(400, 'Cannot reschedule a canceled booking');
	}

	// Parse settings for time format
	let timeFormat: '12h' | '24h' = '12h';
	try {
		const settings = booking.settings ? JSON.parse(booking.settings) : {};
		timeFormat = settings.timeFormat === '24h' ? '24h' : '12h';
	} catch {
		// Keep default
	}

	return {
		booking: {
			id: booking.id,
			startTime: booking.start_time,
			endTime: booking.end_time,
			attendeeName: booking.attendee_name,
			attendeeEmail: booking.attendee_email,
			attendeeNotes: booking.attendee_notes,
			eventName: booking.event_name,
			eventSlug: booking.event_slug,
			duration: booking.duration,
			description: booking.description,
			coverImage: booking.cover_image,
			inviteCalendar: booking.invite_calendar || 'google',
			hostName: booking.host_name,
			profileImage: booking.profile_image,
			brandColor: booking.brand_color || '#3b82f6'
		},
		timeFormat,
		appUrl: env.APP_URL || ''
	};
};
