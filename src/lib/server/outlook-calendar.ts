/**
 * Microsoft Outlook Calendar API integration
 * Uses Microsoft Graph API directly for Cloudflare Workers compatibility
 */

export interface OutlookCalendarEvent {
	id: string;
	subject: string;
	start: { dateTime: string; timeZone: string };
	end: { dateTime: string; timeZone: string };
	webLink?: string;
	onlineMeeting?: {
		joinUrl: string;
	};
}

export interface BusySlot {
	start: string;
	end: string;
}

/**
 * Get Outlook OAuth authorization URL
 */
export function getOutlookAuthUrl(
	clientId: string,
	redirectUri: string,
	state: string
): string {
	const params = new URLSearchParams({
		client_id: clientId,
		response_type: 'code',
		redirect_uri: redirectUri,
		scope: 'offline_access Calendars.ReadWrite User.Read',
		state,
		response_mode: 'query'
	});

	return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeOutlookCode(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<{
	access_token: string;
	refresh_token: string;
	expires_in: number;
}> {
	const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		}).toString()
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to exchange Outlook code: ${error}`);
	}

	return response.json();
}

/**
 * Refresh Outlook access token
 */
export async function refreshOutlookAccessToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string
): Promise<{
	access_token: string;
	refresh_token?: string;
	expires_in: number;
}> {
	const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
		}).toString()
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to refresh Outlook token: ${error}`);
	}

	return response.json();
}

/**
 * Get user's busy times from Outlook Calendar
 */
export async function getOutlookBusyTimes(
	accessToken: string,
	startDate: Date,
	endDate: Date
): Promise<BusySlot[]> {
	// Use the calendarView endpoint to get events in a time range
	const startISO = startDate.toISOString();
	const endISO = endDate.toISOString();

	const response = await fetch(
		`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}&$select=start,end,showAs`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			}
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to fetch Outlook busy times: ${error}`);
	}

	const data = await response.json() as {
		value: Array<{
			start: { dateTime: string; timeZone: string };
			end: { dateTime: string; timeZone: string };
			showAs: string;
		}>;
	};

	// Filter to only busy/tentative events and convert to BusySlot format
	return data.value
		.filter(event => event.showAs === 'busy' || event.showAs === 'tentative')
		.map(event => ({
			// Microsoft returns times without Z suffix, they're in the specified timezone
			// Convert to ISO format
			start: new Date(event.start.dateTime + 'Z').toISOString(),
			end: new Date(event.end.dateTime + 'Z').toISOString()
		}));
}

/**
 * Create an Outlook calendar event with Teams meeting
 */
export async function createOutlookCalendarEvent(
	accessToken: string,
	event: {
		summary: string;
		description?: string;
		startTime: string;
		endTime: string;
		attendeeEmail: string;
		hostEmail: string;
		createTeamsMeeting?: boolean;
	}
): Promise<OutlookCalendarEvent> {
	const body: Record<string, unknown> = {
		subject: event.summary,
		body: {
			contentType: 'text',
			content: event.description || ''
		},
		start: {
			dateTime: event.startTime.replace('Z', ''),
			timeZone: 'UTC'
		},
		end: {
			dateTime: event.endTime.replace('Z', ''),
			timeZone: 'UTC'
		},
		attendees: [
			{
				emailAddress: {
					address: event.attendeeEmail
				},
				type: 'required'
			}
		]
	};

	// Add online meeting if requested
	if (event.createTeamsMeeting !== false) {
		body.isOnlineMeeting = true;
		// Don't specify provider - Microsoft Graph will automatically choose:
		// - teamsForBusiness for Microsoft 365 Business/Enterprise accounts
		// - skypeForConsumer for personal Microsoft accounts
	}

	let response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to create Outlook calendar event: ${error}`);
	}

	return response.json();
}

/**
 * Cancel/delete an Outlook calendar event
 */
export async function cancelOutlookCalendarEvent(
	accessToken: string,
	eventId: string
): Promise<void> {
	const response = await fetch(
		`https://graph.microsoft.com/v1.0/me/events/${eventId}`,
		{
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		}
	);

	if (!response.ok && response.status !== 404) {
		const error = await response.text();
		throw new Error(`Failed to cancel Outlook calendar event: ${error}`);
	}
}

/**
 * Get valid Outlook access token (refresh if needed)
 */
export async function getValidOutlookAccessToken(
	db: D1Database,
	userId: string,
	clientId: string,
	clientSecret: string
): Promise<string> {
	// Get user's Outlook refresh token from database
	const user = await db
		.prepare('SELECT outlook_refresh_token FROM users WHERE id = ?')
		.bind(userId)
		.first<{
			outlook_refresh_token: string | null;
		}>();

	if (!user?.outlook_refresh_token) {
		throw new Error('User not connected to Outlook Calendar');
	}

	// Refresh access token to get a fresh one
	const tokens = await refreshOutlookAccessToken(
		user.outlook_refresh_token,
		clientId,
		clientSecret
	);

	// If Microsoft returned a new refresh token, update it in the database
	if (tokens.refresh_token && tokens.refresh_token !== user.outlook_refresh_token) {
		await db
			.prepare('UPDATE users SET outlook_refresh_token = ? WHERE id = ?')
			.bind(tokens.refresh_token, userId)
			.run();
	}

	return tokens.access_token;
}

/**
 * Get Outlook user profile info
 */
export async function getOutlookUserProfile(
	accessToken: string
): Promise<{ email: string; name: string }> {
	const response = await fetch('https://graph.microsoft.com/v1.0/me', {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to get Outlook user profile: ${error}`);
	}

	const data = await response.json() as {
		mail?: string;
		userPrincipalName: string;
		displayName: string;
	};

	return {
		email: data.mail || data.userPrincipalName,
		name: data.displayName
	};
}
