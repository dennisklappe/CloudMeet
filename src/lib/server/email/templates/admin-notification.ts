/**
 * Admin notification email template (new booking)
 */

import type { BookingEmailData } from '../types';
import { createEmailFormatters } from '../formatters';
import { generateBaseEmail, generateAttendeeNotesCard, generateActionButton } from './base';

/**
 * Generate HTML email for admin notification (new booking)
 */
export function generateAdminNotificationEmail(data: BookingEmailData): string {
	const { formatDate, formatTime } = createEmailFormatters(data.timeFormat, data.timezone);
	const brandColor = data.brandColor || '#3b82f6';

	const headerContent = `
		<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">New Booking!</h1>
	`;

	const attendeeNotes = data.attendeeNotes
		? generateAttendeeNotesCard(data.attendeeName, data.attendeeNotes)
		: '';

	const meetingLabel = data.meetingType === 'teams' ? 'Join Microsoft Teams Meeting' : 'Join Google Meet';
	const actionButton = data.meetingUrl
		? generateActionButton(data.meetingUrl, meetingLabel, brandColor)
		: '';

	const bodyContent = `
		<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 24px;">
			You have a new meeting booked!
		</p>

		<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 30px;">
			<tr>
				<td style="padding: 24px;">
					<div style="margin-bottom: 12px;">
						<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Attendee</div>
						<div style="color: #111827; font-size: 16px; font-weight: 500;">${data.attendeeName}</div>
						<div style="color: #6b7280; font-size: 14px;">${data.attendeeEmail}</div>
					</div>

					<div style="margin-bottom: 12px;">
						<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Event</div>
						<div style="color: #111827; font-size: 16px; font-weight: 500;">${data.eventName}</div>
					</div>

					<div style="margin-bottom: 12px;">
						<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Date</div>
						<div style="color: #111827; font-size: 16px; font-weight: 500;">${formatDate(data.startTime)}</div>
					</div>

					<div>
						<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Time</div>
						<div style="color: #111827; font-size: 16px; font-weight: 500;">${formatTime(data.startTime)} - ${formatTime(data.endTime)}</div>
					</div>
				</td>
			</tr>
		</table>

		${attendeeNotes}
		${actionButton}
	`;

	return generateBaseEmail({
		title: 'New Booking',
		headerGradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
		headerContent,
		bodyContent,
		footerContent: 'Powered by',
		hostName: data.hostName
	});
}
