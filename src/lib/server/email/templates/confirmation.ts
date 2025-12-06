/**
 * Booking confirmation email template
 */

import type { BookingEmailData } from '../types';
import { createEmailFormatters } from '../formatters';
import {
	generateBaseEmail,
	generateMeetingDetailsCard,
	generateYourMessageCard,
	generateActionButton,
	generateManagementLinks
} from './base';

/**
 * Generate HTML email template for booking confirmation
 */
export function generateBookingEmail(data: BookingEmailData): string {
	const { formatDate, formatTime } = createEmailFormatters(data.timeFormat, data.timezone);
	const contactEmail = data.hostContactEmail || data.hostEmail;
	const brandColor = data.brandColor || '#3b82f6';

	const cancelUrl = `${data.appUrl}/cancel/${data.bookingId}`;
	const rescheduleUrl = `${data.appUrl}/reschedule/${data.bookingId}`;

	const headerContent = `
		<div style="width: 64px; height: 64px; margin: 0 auto 20px; background-color: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M5 13l4 4L19 7"></path>
			</svg>
		</div>
		<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Meeting Confirmed!</h1>
	`;

	const meetingLabel = data.meetingType === 'teams' ? 'Join Microsoft Teams Meeting' : 'Join Google Meet';

	const meetingDetails = generateMeetingDetailsCard({
		eventName: data.eventName,
		eventDescription: data.eventDescription,
		formattedDate: formatDate(data.startTime),
		formattedTime: `${formatTime(data.startTime)} - ${formatTime(data.endTime)}`,
		meetingUrl: data.meetingUrl,
		meetingType: data.meetingType,
		brandColor
	});

	const attendeeNotes = data.attendeeNotes
		? generateYourMessageCard(data.attendeeNotes)
		: '';

	const actionButton = data.meetingUrl
		? generateActionButton(data.meetingUrl, meetingLabel, brandColor)
		: '';

	const managementLinks = generateManagementLinks(rescheduleUrl, cancelUrl, brandColor);

	const bodyContent = `
		<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 24px;">
			Hi <strong>${data.attendeeName}</strong>,
		</p>
		<p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 24px;">
			Your meeting with <strong>${data.hostName}</strong> has been confirmed. We're looking forward to speaking with you!
		</p>

		${meetingDetails}
		${attendeeNotes}
		${actionButton}
		${managementLinks}

		<p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 20px;">
			If you need to make changes or have any questions, please reply to this email or contact <a href="mailto:${contactEmail}" style="color: ${brandColor}; text-decoration: none;">${contactEmail}</a>.
		</p>
	`;

	return generateBaseEmail({
		title: 'Meeting Confirmed',
		headerGradient: brandColor,
		headerContent,
		bodyContent,
		footerContent: `This is an automated email from ${data.hostName}'s meeting scheduler.`,
		hostName: data.hostName
	});
}

/**
 * Generate plain text version of booking email
 */
export function generateBookingEmailText(data: BookingEmailData): string {
	const { formatDateTime } = createEmailFormatters(data.timeFormat, data.timezone);
	const contactEmail = data.hostContactEmail || data.hostEmail;

	const cancelUrl = `${data.appUrl}/cancel/${data.bookingId}`;
	const rescheduleUrl = `${data.appUrl}/reschedule/${data.bookingId}`;

	return `
Meeting Confirmed!

Hi ${data.attendeeName},

Your meeting with ${data.hostName} has been confirmed. We're looking forward to speaking with you!

MEETING DETAILS
Event: ${data.eventName}
${data.eventDescription ? `Description: ${data.eventDescription}` : ''}
Time: ${formatDateTime(data.startTime)} - ${formatDateTime(data.endTime)}
${data.meetingUrl ? `Location: ${data.meetingUrl}` : ''}

${data.meetingUrl ? `Join Meeting: ${data.meetingUrl}` : ''}

MANAGE YOUR BOOKING
Reschedule: ${rescheduleUrl}
Cancel: ${cancelUrl}

If you need to make changes or have any questions, please reply to this email or contact ${contactEmail}.

---
This is an automated email from ${data.hostName}'s meeting scheduler.
Powered by CloudMeet - https://github.com/dennisklappe/CloudMeet
	`.trim();
}
