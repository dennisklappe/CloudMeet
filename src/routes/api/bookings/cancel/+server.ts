/**
 * Cancel Booking API endpoint
 * Cancels a booking and sends notification to attendee with optional message
 */

import { json, error, type RequestEvent } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth';
import { cancelCalendarEvent, getValidAccessToken } from '$lib/server/google-calendar';
import { cancelOutlookCalendarEvent, getValidOutlookAccessToken } from '$lib/server/outlook-calendar';
import { sendCancellationEmail, getEmailTemplates, isEmailEnabled } from '$lib/server/email';

export const POST = async (event: RequestEvent) => {
	const env = event.platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const db = env.DB;

	// Get current user
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await event.request.json() as {
			bookingId: string;
			message?: string | null;
		};
		const { bookingId, message } = body;

		if (!bookingId) {
			throw error(400, 'Booking ID is required');
		}

		// Get booking and verify ownership
		const booking = await db
			.prepare(
				`SELECT b.id, b.user_id, b.google_event_id, b.outlook_event_id, b.status, b.start_time, b.end_time,
				b.attendee_name, b.attendee_email,
				e.name as event_name, e.slug as event_slug, e.description as event_description,
				u.name as host_name, u.email as host_email, u.contact_email, u.settings, u.brand_color
				FROM bookings b
				JOIN event_types e ON b.event_type_id = e.id
				JOIN users u ON b.user_id = u.id
				WHERE b.id = ?`
			)
			.bind(bookingId)
			.first<{
				id: string;
				user_id: string;
				google_event_id: string | null;
				outlook_event_id: string | null;
				status: string;
				start_time: string;
				end_time: string;
				attendee_name: string;
				attendee_email: string;
				event_name: string;
				event_slug: string;
				event_description: string | null;
				host_name: string;
				host_email: string;
				contact_email: string | null;
				settings: string | null;
				brand_color: string | null;
			}>();

		if (!booking) {
			throw error(404, 'Booking not found');
		}

		if (booking.user_id !== userId) {
			throw error(403, 'You do not have permission to cancel this booking');
		}

		if (booking.status === 'canceled') {
			throw error(400, 'Booking is already canceled');
		}

		// Cancel in Google Calendar if event exists
		if (booking.google_event_id) {
			try {
				const accessToken = await getValidAccessToken(
					db,
					booking.user_id,
					env.GOOGLE_CLIENT_ID,
					env.GOOGLE_CLIENT_SECRET
				);
				await cancelCalendarEvent(accessToken, booking.google_event_id);
			} catch (err) {
				console.error('Failed to cancel Google Calendar event:', err);
				// Continue with database cancellation even if Google Calendar fails
			}
		}

		// Cancel in Outlook Calendar if event exists
		if (booking.outlook_event_id && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
			try {
				const outlookToken = await getValidOutlookAccessToken(
					db,
					booking.user_id,
					env.MICROSOFT_CLIENT_ID,
					env.MICROSOFT_CLIENT_SECRET
				);
				await cancelOutlookCalendarEvent(outlookToken, booking.outlook_event_id);
			} catch (err) {
				console.error('Failed to cancel Outlook Calendar event:', err);
				// Continue with database cancellation even if Outlook Calendar fails
			}
		}

		// Update booking status
		await db
			.prepare('UPDATE bookings SET status = ?, canceled_at = CURRENT_TIMESTAMP, canceled_by = ?, cancellation_reason = ? WHERE id = ?')
			.bind('canceled', 'host', message || null, bookingId)
			.run();

		// Cancel any scheduled reminder emails
		await db
			.prepare(`UPDATE scheduled_emails SET status = 'cancelled' WHERE booking_id = ? AND status = 'pending'`)
			.bind(bookingId)
			.run();

		// Send cancellation email if enabled
		if (env.EMAILIT_API_KEY) {
			try {
				// Parse user settings for time format
				let timeFormat: '12h' | '24h' = '12h';
				try {
					const settings = booking.settings ? JSON.parse(booking.settings) : {};
					timeFormat = settings.timeFormat === '24h' ? '24h' : '12h';
				} catch {
					// Keep default
				}

				const replyToEmail = booking.contact_email || booking.host_email;
				const templates = await getEmailTemplates(db, booking.user_id);

				if (isEmailEnabled(templates, 'cancellation')) {
					const template = templates.get('cancellation');
					await sendCancellationEmail(
						{
							attendeeName: booking.attendee_name,
							attendeeEmail: booking.attendee_email,
							eventName: booking.event_name,
							eventSlug: booking.event_slug,
							eventDescription: booking.event_description || '',
							startTime: new Date(booking.start_time),
							endTime: new Date(booking.end_time),
							meetingUrl: null,
							bookingId: booking.id,
							hostName: booking.host_name,
							hostEmail: booking.host_email,
							hostContactEmail: booking.contact_email || undefined,
							appUrl: env.APP_URL || '',
							customMessage: message || template?.custom_message || null,
							timeFormat,
							brandColor: booking.brand_color || undefined
						},
						{
							apiKey: env.EMAILIT_API_KEY,
							from: env.EMAIL_FROM || booking.host_email,
							replyTo: replyToEmail
						},
						template?.subject || undefined
					);
				}

				// No admin notification needed - admin is the one cancelling from dashboard
			} catch (emailErr) {
				console.error('Failed to send cancellation email:', emailErr);
				// Don't fail the request if email fails
			}
		}

		return json({ success: true });
	} catch (err: any) {
		console.error('Cancel booking error:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to cancel booking');
	}
};
