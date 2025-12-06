/**
 * Reminder email templates
 */

import type { BookingEmailData } from '../types';
import { createEmailFormatters } from '../formatters';
import { generateBaseEmail, generateActionButton, generateManagementLinks } from './base';

type ReminderType = 'reminder_24h' | 'reminder_1h' | 'reminder_30m';

const TIME_LABELS: Record<ReminderType, string> = {
	'reminder_24h': 'tomorrow',
	'reminder_1h': 'in 1 hour',
	'reminder_30m': 'in 30 minutes'
};

const URGENCY_COLORS: Record<ReminderType, { bg: string; text: string; gradient: string }> = {
	'reminder_24h': { bg: '#dbeafe', text: '#1e40af', gradient: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' },
	'reminder_1h': { bg: '#fef3c7', text: '#92400e', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
	'reminder_30m': { bg: '#fee2e2', text: '#991b1b', gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }
};

/**
 * Generate HTML email for reminders
 */
export function generateReminderEmail(data: BookingEmailData, reminderType: ReminderType): string {
	const { formatDate, formatTime } = createEmailFormatters(data.timeFormat, data.timezone);
	const brandColor = data.brandColor || '#3b82f6';

	const cancelUrl = `${data.appUrl}/cancel/${data.bookingId}`;
	const rescheduleUrl = `${data.appUrl}/reschedule/${data.bookingId}`;

	const colors = URGENCY_COLORS[reminderType];
	const timeLabel = TIME_LABELS[reminderType];

	const headerContent = `
		<h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Meeting ${timeLabel}!</h1>
	`;

	const customMessageSection = data.customMessage ? `
		<p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 24px; padding: 16px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid ${brandColor};">
			${data.customMessage}
		</p>
	` : '';

	const meetingLabel = data.meetingType === 'teams' ? 'Join Microsoft Teams Meeting' : 'Join Google Meet';
	const actionButton = data.meetingUrl
		? generateActionButton(data.meetingUrl, meetingLabel, brandColor)
		: '';

	const managementLinks = generateManagementLinks(rescheduleUrl, cancelUrl, brandColor);

	const bodyContent = `
		<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 24px;">
			Hi <strong>${data.attendeeName}</strong>,
		</p>
		<p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 24px;">
			This is a friendly reminder about your upcoming meeting with <strong>${data.hostName}</strong>.
		</p>
		${customMessageSection}

		<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${colors.bg}; border-radius: 8px; margin-bottom: 30px;">
			<tr>
				<td style="padding: 24px;">
					<div style="color: ${colors.text}; font-size: 14px; margin-bottom: 8px; font-weight: 600;">${data.eventName}</div>
					<div style="color: ${colors.text}; font-size: 20px; font-weight: 700;">${formatDate(data.startTime)}</div>
					<div style="color: ${colors.text}; font-size: 18px; margin-top: 4px;">${formatTime(data.startTime)} - ${formatTime(data.endTime)}</div>
				</td>
			</tr>
		</table>

		${actionButton}
		${managementLinks}
	`;

	return generateBaseEmail({
		title: 'Meeting Reminder',
		headerGradient: colors.gradient,
		headerContent,
		bodyContent,
		footerContent: `This is an automated email from ${data.hostName}'s meeting scheduler.`,
		hostName: data.hostName
	});
}

/**
 * Get default reminder subjects
 */
export function getDefaultReminderSubject(data: BookingEmailData, reminderType: ReminderType): string {
	const subjects: Record<ReminderType, string> = {
		'reminder_24h': `Reminder: ${data.eventName} tomorrow with ${data.hostName}`,
		'reminder_1h': `Reminder: ${data.eventName} starts in 1 hour`,
		'reminder_30m': `Starting Soon: ${data.eventName} in 30 minutes`
	};
	return subjects[reminderType];
}
