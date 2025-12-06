/**
 * Email service types
 */

export interface BookingEmailData {
	attendeeName: string;
	attendeeEmail: string;
	eventName: string;
	eventSlug?: string;
	eventDescription: string;
	startTime: Date;
	endTime: Date;
	meetingUrl: string | null;
	meetingType?: 'google_meet' | 'teams';
	bookingId: string | number;
	hostName: string;
	hostEmail: string;
	hostContactEmail?: string;
	appUrl: string;
	customMessage?: string | null;
	timeFormat?: '12h' | '24h';
	timezone?: string;
	brandColor?: string;
	attendeeNotes?: string | null;
}

export interface RescheduleEmailData extends BookingEmailData {
	oldStartTime: Date;
	oldEndTime: Date;
}

export type EmailTemplateType = 'confirmation' | 'cancellation' | 'reschedule' | 'reminder_24h' | 'reminder_1h' | 'reminder_30m';

export interface EmailTemplate {
	template_type: EmailTemplateType;
	is_enabled: boolean;
	subject: string | null;
	custom_message: string | null;
}

export interface EmailConfig {
	apiKey: string;
	from: string;
	replyTo?: string;
}
