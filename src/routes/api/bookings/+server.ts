/**
 * Bookings API endpoint
 * Creates new bookings and adds them to Google Calendar and/or Outlook Calendar
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCalendarEvent, getValidAccessToken } from '$lib/server/google-calendar';
import { createOutlookCalendarEvent, getValidOutlookAccessToken } from '$lib/server/outlook-calendar';
import { sendBookingEmail, sendAdminNotificationEmail, getEmailTemplates, isEmailEnabled, type EmailTemplateType } from '$lib/server/email';
import { loadBusyTimes, parseUserSettings } from '$lib/server/busy';
import { generateSlots, loadRulesByDay, resolveEventLimits } from '$lib/server/slots';
import { isValidEmail, validateLength, validateFields, MAX_LENGTHS } from '$lib/server/validation';

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	try {
		const body = await request.json() as {
			eventSlug: string;
			startTime: string;
			attendeeName: string;
			attendeeEmail: string;
			notes?: string;
			turnstileToken?: string;
			timezone?: string;
		};
		const { eventSlug, startTime, attendeeName, attendeeEmail, notes, turnstileToken, timezone } = body;

		// Validate required fields
		if (!eventSlug || !startTime || !attendeeName || !attendeeEmail) {
			throw error(400, 'Missing required fields');
		}

		// Validate input lengths
		const lengthError = validateFields([
			validateLength(attendeeName, 'Name', MAX_LENGTHS.name, true),
			validateLength(attendeeEmail, 'Email', MAX_LENGTHS.email, true),
			validateLength(notes, 'Notes', MAX_LENGTHS.notes, false)
		]);
		if (lengthError) {
			throw error(400, lengthError);
		}

		// Validate email format
		if (!isValidEmail(attendeeEmail)) {
			throw error(400, 'Invalid email address');
		}

		// Verify Turnstile token (if provided)
		if (turnstileToken) {
			const turnstileResponse = await fetch(
				'https://challenges.cloudflare.com/turnstile/v0/siteverify',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						secret: env.TURNSTILE_SECRET_KEY || '',
						response: turnstileToken
					})
				}
			);

			const turnstileResult = await turnstileResponse.json() as { success: boolean };
			if (!turnstileResult.success) {
				throw error(400, 'Turnstile verification failed');
			}
		}

		const db = env.DB;

		// Get the first (and only) user for single-user setup
		const user = await db
			.prepare('SELECT id, email, name, slug, contact_email, settings, brand_color, outlook_refresh_token, timezone FROM users LIMIT 1')
			.first<{ id: string; email: string; name: string; slug: string; contact_email: string | null; settings: string | null; brand_color: string | null; outlook_refresh_token: string | null; timezone: string | null }>();

		if (!user) {
			throw error(404, 'User not found');
		}

		const eventType = await db
			.prepare(
				`SELECT id, name, duration_minutes as duration, description, invite_calendar, availability_calendars,
					buffer_minutes, min_notice_minutes, max_advance_days
				FROM event_types WHERE user_id = ? AND slug = ? AND is_active = 1`
			)
			.bind(user.id, eventSlug)
			.first<{
				id: string;
				name: string;
				duration: number;
				description: string;
				invite_calendar: string | null;
				availability_calendars: string | null;
				buffer_minutes: number | null;
				min_notice_minutes: number | null;
				max_advance_days: number | null;
			}>();

		if (!eventType) {
			throw error(404, 'Event type not found or inactive');
		}

		const userSettings = parseUserSettings<{ defaultInviteCalendar?: string; defaultAvailabilityCalendars?: string; selectedGoogleCalendars?: string[] }>(user.settings);

		// Get calendar settings: use event type override if set, otherwise use global settings
		// Fall back to Google if Outlook was selected but is no longer connected
		const outlookConnected = !!user.outlook_refresh_token;
		const outlookConfigured = !!(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
		let inviteCalendar = eventType.invite_calendar || userSettings.defaultInviteCalendar || 'google';
		if (inviteCalendar === 'outlook' && (!outlookConnected || !outlookConfigured)) {
			inviteCalendar = 'google'; // Fall back to Google
		}

		// The end time always follows from the event duration, never from the client
		const startDateTime = new Date(startTime);
		if (Number.isNaN(startDateTime.getTime())) {
			throw error(400, 'Invalid start time');
		}
		const endDateTime = new Date(startDateTime.getTime() + eventType.duration * 60 * 1000);
		const startIso = startDateTime.toISOString();
		const endIso = endDateTime.toISOString();

		// Verify the slot is still offered: inside the (event specific) hours, outside the
		// notice and booking window, not clashing with calendars, bookings or the buffer
		const hostTimezone = user.timezone || 'UTC';
		const hostDate = new Intl.DateTimeFormat('en-CA', {
			timeZone: hostTimezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(startDateTime);
		const rulesByDay = await loadRulesByDay(db, user.id, eventType.id);
		const hostDayOfWeek = new Date(`${hostDate}T12:00:00Z`).getUTCDay();
		const busy = await loadBusyTimes(
			env,
			db,
			user.id,
			userSettings,
			eventType.availability_calendars,
			new Date(startDateTime.getTime() - 24 * 60 * 60 * 1000),
			new Date(startDateTime.getTime() + 48 * 60 * 60 * 1000)
		);
		const offered = generateSlots({
			dateStr: hostDate,
			rules: rulesByDay.get(hostDayOfWeek) ?? [],
			durationMinutes: eventType.duration,
			timezone: hostTimezone,
			busy,
			limits: resolveEventLimits(eventType)
		});

		if (!offered.some((slot) => slot.start === startIso)) {
			throw error(409, 'This time slot is no longer available');
		}

		// Create calendar event in the selected calendar only (one calendar sends the invite)
		let googleEventId: string | null = null;
		let outlookEventId: string | null = null;
		let meetingUrl: string | null = null;

		if (inviteCalendar === 'google') {
			// Create Google Calendar event with Google Meet
			try {
				const accessToken = await getValidAccessToken(
					db,
					user.id,
					env.GOOGLE_CLIENT_ID,
					env.GOOGLE_CLIENT_SECRET
				);

				const calendarEvent = await createCalendarEvent(accessToken, {
					summary: `${eventType.name} with ${attendeeName}`,
					description: `${eventType.description || ''}\n\nAttendee: ${attendeeName} (${attendeeEmail})${notes ? `\n\nNotes from attendee:\n${notes}` : ''}`,
					start: {
						dateTime: startDateTime.toISOString(),
						timeZone: 'UTC'
					},
					end: {
						dateTime: endDateTime.toISOString(),
						timeZone: 'UTC'
					},
					attendees: [
						{ email: attendeeEmail }
					],
					conferenceData: {
						createRequest: {
							requestId: crypto.randomUUID(),
							conferenceSolutionKey: { type: 'hangoutsMeet' }
						}
					}
				});

				googleEventId = calendarEvent.id;
				meetingUrl = calendarEvent.hangoutLink || null;
			} catch (err) {
				console.error('Error creating Google Calendar event:', err);
				// Continue without Google Calendar event if there's an error
			}
		} else if (inviteCalendar === 'outlook' && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
			// Create Outlook Calendar event with Teams meeting
			try {
				const outlookToken = await getValidOutlookAccessToken(
					db,
					user.id,
					env.MICROSOFT_CLIENT_ID,
					env.MICROSOFT_CLIENT_SECRET
				);

				const outlookEvent = await createOutlookCalendarEvent(outlookToken, {
					summary: `${eventType.name} with ${attendeeName}`,
					description: `${eventType.description || ''}\n\nAttendee: ${attendeeName} (${attendeeEmail})${notes ? `\n\nNotes from attendee:\n${notes}` : ''}`,
					startTime: startDateTime.toISOString(),
					endTime: endDateTime.toISOString(),
					attendeeEmail,
					hostEmail: user.email,
					createTeamsMeeting: true
				});

				outlookEventId = outlookEvent.id;
				if (outlookEvent.onlineMeeting?.joinUrl) {
					meetingUrl = outlookEvent.onlineMeeting.joinUrl;
				}
			} catch (err) {
				console.error('Error creating Outlook Calendar event:', err);
				// Continue without Outlook Calendar event if there's an error
			}
		}

		// Create booking in database
		const result = await db
			.prepare(
				`INSERT INTO bookings (
					user_id, event_type_id, start_time, end_time,
					attendee_name, attendee_email, attendee_notes, status,
					google_event_id, outlook_event_id, meeting_url, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, CURRENT_TIMESTAMP)`
			)
			.bind(
				user.id,
				eventType.id,
				startIso,
				endIso,
				attendeeName,
				attendeeEmail,
				notes || null,
				googleEventId,
				outlookEventId,
				meetingUrl
			)
			.run();

		// Invalidate availability cache
		await env.KV.delete(`availability:${eventSlug}:${hostDate}`);
		await env.KV.delete(`availability:month:${eventSlug}:${hostDate.slice(0, 7)}`);

		// Send booking confirmation email via Emailit (if enabled)
		if (env.EMAILIT_API_KEY) {
			try {
				// Parse user settings for time format
				let timeFormat: '12h' | '24h' = '12h';
				try {
					const settings = user.settings ? JSON.parse(user.settings) : {};
					timeFormat = settings.timeFormat === '24h' ? '24h' : '12h';
				} catch {
					// Keep default
				}

				// Use contact email for reply-to if available
				const replyToEmail = user.contact_email || user.email;

				// Get the booking ID (it's a UUID string, not integer)
				const bookingResult = await db
					.prepare('SELECT id FROM bookings WHERE google_event_id = ? OR outlook_event_id = ? OR (user_id = ? AND start_time = ? AND attendee_email = ?)')
					.bind(googleEventId, outlookEventId, user.id, startIso, attendeeEmail)
					.first<{ id: string }>();
				const bookingId = bookingResult?.id || result.meta.last_row_id?.toString() || '';

				// Get email templates to check if confirmation is enabled
				const templates = await getEmailTemplates(db, user.id);
				const confirmationEnabled = isEmailEnabled(templates, 'confirmation');

				const emailData = {
					attendeeName,
					attendeeEmail,
					eventName: eventType.name,
					eventDescription: eventType.description || '',
					startTime: startDateTime,
					endTime: endDateTime,
					meetingUrl,
					meetingType: (inviteCalendar === 'outlook' ? 'teams' : 'google_meet') as 'google_meet' | 'teams',
					bookingId,
					hostName: user.name,
					hostEmail: user.email,
					hostContactEmail: user.contact_email || undefined,
					appUrl: env.APP_URL || '',
					timeFormat,
					timezone: timezone || 'UTC',
					brandColor: user.brand_color || undefined,
					attendeeNotes: notes || undefined
				};

				if (confirmationEnabled) {
					const template = templates.get('confirmation');
					await sendBookingEmail(
						{
							...emailData,
							customMessage: template?.custom_message
						},
						{
							apiKey: env.EMAILIT_API_KEY,
							from: env.EMAIL_FROM || user.email,
							replyTo: replyToEmail
						},
						template?.subject || undefined
					);
				}

				// Send admin notification email to contact_email (or fallback to main email)
				await sendAdminNotificationEmail(
					emailData,
					user.contact_email || user.email,
					{
						apiKey: env.EMAILIT_API_KEY,
						from: env.EMAIL_FROM || user.email
					}
				);

				// Schedule reminder emails
				const reminderTypes: EmailTemplateType[] = ['reminder_24h', 'reminder_1h'];
				const reminderOffsets: Record<string, number> = {
					'reminder_24h': 24 * 60 * 60 * 1000, // 24 hours
					'reminder_1h': 60 * 60 * 1000 // 1 hour
				};

				for (const reminderType of reminderTypes) {
					if (isEmailEnabled(templates, reminderType)) {
						const scheduledFor = new Date(startDateTime.getTime() - reminderOffsets[reminderType]);
						// Only schedule if the reminder time is in the future
						if (scheduledFor > new Date()) {
							await db
								.prepare(`INSERT INTO scheduled_emails (booking_id, template_type, scheduled_for) VALUES (?, ?, ?)`)
								.bind(bookingId, reminderType, scheduledFor.toISOString())
								.run();
						}
					}
				}
			} catch (emailError) {
				console.error('Failed to send confirmation email:', emailError);
			}
		}

		return json({
			success: true,
			bookingId: result.meta.last_row_id,
			meetingUrl,
			meetingType: inviteCalendar === 'outlook' ? 'teams' : 'google_meet'
		});
	} catch (err: any) {
		console.error('Booking creation error:', err);
		if (err?.status) throw err; // Re-throw SvelteKit errors
		throw error(500, 'Failed to create booking');
	}
};
