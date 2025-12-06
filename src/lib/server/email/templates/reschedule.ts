/**
 * Reschedule email templates
 */

import type { RescheduleEmailData } from '../types';
import { createEmailFormatters } from '../formatters';
import { generateBaseEmail, generateActionButton, generateManagementLinks, generateYourMessageCard, generateAttendeeNotesCard } from './base';

/**
 * Generate HTML email for reschedule
 */
export function generateRescheduleEmail(data: RescheduleEmailData): string {
	const { formatDate, formatTime } = createEmailFormatters(data.timeFormat, data.timezone);
	const brandColor = data.brandColor || '#3b82f6';

	const cancelUrl = `${data.appUrl}/cancel/${data.bookingId}`;
	const rescheduleUrl = `${data.appUrl}/reschedule/${data.bookingId}`;

	const headerContent = `
		<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Meeting Rescheduled</h1>
	`;

	const customMessageSection = data.customMessage ? `
		<p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 24px; padding: 16px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #f97316;">
			${data.customMessage}
		</p>
	` : '';

	const attendeeNotesSection = data.attendeeNotes
		? generateYourMessageCard(data.attendeeNotes)
		: '';

	const meetingLabel = data.meetingType === 'teams' ? 'Join Microsoft Teams Meeting' : 'Join Google Meet';
	const actionButton = data.meetingUrl
		? generateActionButton(data.meetingUrl, meetingLabel, brandColor)
		: '';

	const managementLinks = generateManagementLinks(rescheduleUrl, cancelUrl, brandColor)
		.replace('Reschedule</a>', 'Reschedule Again</a>');

	const bodyContent = `
		<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 24px;">
			Hi <strong>${data.attendeeName}</strong>,
		</p>
		<p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 24px;">
			Your meeting with <strong>${data.hostName}</strong> has been rescheduled to a new time.
		</p>
		${customMessageSection}
		${attendeeNotesSection}

		<!-- Old time crossed out -->
		<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca; margin-bottom: 16px;">
			<tr>
				<td style="padding: 16px;">
					<div style="color: #991b1b; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 8px;">Previous Time</div>
					<div style="color: #991b1b; font-size: 16px; text-decoration: line-through;">${formatDate(data.oldStartTime)} at ${formatTime(data.oldStartTime)}</div>
				</td>
			</tr>
		</table>

		<!-- New time highlighted -->
		<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; margin-bottom: 30px;">
			<tr>
				<td style="padding: 16px;">
					<div style="color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 8px;">New Time</div>
					<div style="color: #166534; font-size: 16px; font-weight: 600;">${formatDate(data.startTime)} at ${formatTime(data.startTime)}</div>
				</td>
			</tr>
		</table>

		${actionButton}
		${managementLinks}
	`;

	return generateBaseEmail({
		title: 'Meeting Rescheduled',
		headerGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
		headerContent,
		bodyContent,
		footerContent: `This is an automated email from ${data.hostName}'s meeting scheduler.`,
		hostName: data.hostName
	});
}

/**
 * Generate admin reschedule notification email
 */
export function generateAdminRescheduleEmail(data: RescheduleEmailData): string {
	const { formatDate, formatTime } = createEmailFormatters(data.timeFormat, data.timezone);
	const brandColor = data.brandColor || '#3b82f6';

	const headerContent = `
		<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Booking Rescheduled</h1>
	`;

	const attendeeNotesSection = data.attendeeNotes
		? generateAttendeeNotesCard(data.attendeeName, data.attendeeNotes)
		: '';

	const adminMeetingLabel = data.meetingType === 'teams' ? 'Join Microsoft Teams Meeting' : 'Join Google Meet';
	const actionButton = data.meetingUrl
		? generateActionButton(data.meetingUrl, adminMeetingLabel, brandColor)
		: '';

	const bodyContent = `
		<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 24px;">
			A meeting has been rescheduled.
		</p>

		<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
			<tr>
				<td style="padding: 24px;">
					<div style="margin-bottom: 12px;">
						<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Attendee</div>
						<div style="color: #111827; font-size: 16px; font-weight: 500;">${data.attendeeName}</div>
						<div style="color: #6b7280; font-size: 14px;">${data.attendeeEmail}</div>
					</div>

					<div>
						<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Event</div>
						<div style="color: #111827; font-size: 16px; font-weight: 500;">${data.eventName}</div>
					</div>
				</td>
			</tr>
		</table>

		${attendeeNotesSection}

		<!-- Time Change -->
		<table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
			<tr>
				<td style="width: 48%; vertical-align: top;">
					<div style="background-color: #fef2f2; border-radius: 8px; padding: 16px; border: 1px solid #fecaca;">
						<div style="color: #991b1b; font-size: 12px; font-weight: 600; margin-bottom: 8px; text-transform: uppercase;">Old Time</div>
						<div style="color: #111827; font-size: 15px; font-weight: 500; text-decoration: line-through;">${formatDate(data.oldStartTime)}</div>
						<div style="color: #6b7280; font-size: 14px; text-decoration: line-through;">${formatTime(data.oldStartTime)} - ${formatTime(data.oldEndTime)}</div>
					</div>
				</td>
				<td style="width: 4%; text-align: center; vertical-align: middle;">
					<span style="color: #9ca3af; font-size: 20px;">→</span>
				</td>
				<td style="width: 48%; vertical-align: top;">
					<div style="background-color: #f0fdf4; border-radius: 8px; padding: 16px; border: 1px solid #bbf7d0;">
						<div style="color: #166534; font-size: 12px; font-weight: 600; margin-bottom: 8px; text-transform: uppercase;">New Time</div>
						<div style="color: #111827; font-size: 15px; font-weight: 500;">${formatDate(data.startTime)}</div>
						<div style="color: #6b7280; font-size: 14px;">${formatTime(data.startTime)} - ${formatTime(data.endTime)}</div>
					</div>
				</td>
			</tr>
		</table>

		${actionButton}
	`;

	return generateBaseEmail({
		title: 'Booking Rescheduled',
		headerGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
		headerContent,
		bodyContent,
		footerContent: 'Powered by',
		hostName: data.hostName
	});
}
