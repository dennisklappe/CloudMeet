/**
 * Base email template structure
 */

export interface BaseTemplateOptions {
	title: string;
	headerGradient: string;
	headerContent: string;
	bodyContent: string;
	footerContent: string;
	hostName: string;
}

/**
 * Generate base HTML email structure
 */
export function generateBaseEmail(options: BaseTemplateOptions): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${options.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
	<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6;">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<!-- Header -->
					<tr>
						<td style="padding: 40px 40px 20px; text-align: center; background: ${options.headerGradient}; border-radius: 8px 8px 0 0;">
							${options.headerContent}
						</td>
					</tr>

					<!-- Content -->
					<tr>
						<td style="padding: 40px;">
							${options.bodyContent}
						</td>
					</tr>

					<!-- Footer -->
					<tr>
						<td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
							<p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
								${options.footerContent}<br>
								Powered by <a href="https://github.com/dennisklappe/CloudMeet" style="color: #6b7280; text-decoration: none;">CloudMeet</a>
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>
	`.trim();
}

/**
 * Generate meeting details card
 */
export function generateMeetingDetailsCard(options: {
	eventName: string;
	eventDescription?: string;
	formattedDate: string;
	formattedTime: string;
	meetingUrl?: string | null;
	meetingType?: 'google_meet' | 'teams';
	brandColor?: string;
}): string {
	const { eventName, eventDescription, formattedDate, formattedTime, meetingUrl, meetingType = 'google_meet', brandColor = '#3b82f6' } = options;
	const meetingLabel = meetingType === 'teams' ? 'Microsoft Teams' : 'Google Meet';

	return `
<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 30px;">
	<tr>
		<td style="padding: 24px;">
			<h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">Meeting Details</h2>

			<div style="margin-bottom: 12px;">
				<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Event</div>
				<div style="color: #111827; font-size: 16px; font-weight: 500;">${eventName}</div>
				${eventDescription ? `<div style="color: #6b7280; font-size: 14px; margin-top: 4px;">${eventDescription}</div>` : ''}
			</div>

			<div style="margin-bottom: 12px;">
				<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Date</div>
				<div style="color: #111827; font-size: 16px; font-weight: 500;">${formattedDate}</div>
			</div>

			<div style="margin-bottom: 12px;">
				<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Time</div>
				<div style="color: #111827; font-size: 16px; font-weight: 500;">${formattedTime}</div>
			</div>

			${meetingUrl ? `
			<div>
				<div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">Location</div>
				<a href="${meetingUrl}" style="color: ${brandColor}; font-size: 16px; font-weight: 500; text-decoration: none;">${meetingLabel}</a>
			</div>
			` : ''}
		</td>
	</tr>
</table>
	`.trim();
}

/**
 * Generate attendee notes card for admin emails (shows "Message from {name}")
 */
export function generateAttendeeNotesCard(attendeeName: string, notes: string): string {
	return `
<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fef3c7; border-radius: 8px; border: 1px solid #fcd34d; margin-bottom: 30px;">
	<tr>
		<td style="padding: 20px;">
			<div style="color: #92400e; font-size: 14px; font-weight: 600; margin-bottom: 8px;">Message from ${attendeeName}:</div>
			<div style="color: #78350f; font-size: 15px; line-height: 22px;">${notes}</div>
		</td>
	</tr>
</table>
	`.trim();
}

/**
 * Generate attendee notes card for client emails (shows "Your message")
 */
export function generateYourMessageCard(notes: string): string {
	return `
<table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fef3c7; border-radius: 8px; border: 1px solid #fcd34d; margin-bottom: 30px;">
	<tr>
		<td style="padding: 20px;">
			<div style="color: #92400e; font-size: 14px; font-weight: 600; margin-bottom: 8px;">Your message:</div>
			<div style="color: #78350f; font-size: 15px; line-height: 22px;">${notes}</div>
		</td>
	</tr>
</table>
	`.trim();
}

/**
 * Generate action button
 */
export function generateActionButton(url: string, text: string, brandColor: string = '#3b82f6'): string {
	return `
<table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
	<tr>
		<td align="center">
			<a href="${url}" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">${text}</a>
		</td>
	</tr>
</table>
	`.trim();
}

/**
 * Generate management links (reschedule/cancel)
 */
export function generateManagementLinks(rescheduleUrl: string, cancelUrl: string, brandColor: string = '#3b82f6'): string {
	return `
<table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
	<tr>
		<td align="center">
			<a href="${rescheduleUrl}" style="display: inline-block; margin: 0 8px; color: ${brandColor}; text-decoration: none; font-size: 14px;">Reschedule</a>
			<span style="color: #d1d5db;">|</span>
			<a href="${cancelUrl}" style="display: inline-block; margin: 0 8px; color: #ef4444; text-decoration: none; font-size: 14px;">Cancel</a>
		</td>
	</tr>
</table>
	`.trim();
}
