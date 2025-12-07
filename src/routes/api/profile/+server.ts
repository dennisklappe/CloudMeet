/**
 * Profile API endpoint
 * Handles profile updates including name and image
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCurrentUser } from '$lib/server/auth';
import { isValidEmail, validateLength, MAX_LENGTHS } from '$lib/server/validation';

export const PUT: RequestHandler = async (event) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const env = event.platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	const db = env.DB;

	try {
		const body = await event.request.json() as {
			name?: string;
			profileImage?: string | null;
			brandColor?: string | null;
			contactEmail?: string | null;
			timeFormat?: '12h' | '24h';
			// Global calendar settings
			defaultAvailabilityCalendars?: 'google' | 'outlook' | 'both';
			defaultInviteCalendar?: 'google' | 'outlook';
			// Selected calendars for availability checking
			selectedGoogleCalendars?: string[];
		};
		const { name, profileImage, brandColor, contactEmail, timeFormat, defaultAvailabilityCalendars, defaultInviteCalendar, selectedGoogleCalendars } = body;

		// Get existing settings
		const existingUser = await db
			.prepare('SELECT settings FROM users WHERE id = ?')
			.bind(userId)
			.first<{ settings: string | null }>();

		let existingSettings: Record<string, unknown> = {};
		try {
			existingSettings = existingUser?.settings ? JSON.parse(existingUser.settings) : {};
		} catch {
			existingSettings = {};
		}

		// If this is a calendar settings update (no name provided)
		if (name === undefined && (defaultAvailabilityCalendars !== undefined || defaultInviteCalendar !== undefined || selectedGoogleCalendars !== undefined)) {
			// Update only calendar settings
			const newSettings = {
				...existingSettings,
				defaultAvailabilityCalendars: defaultAvailabilityCalendars ?? existingSettings.defaultAvailabilityCalendars ?? 'both',
				defaultInviteCalendar: defaultInviteCalendar ?? existingSettings.defaultInviteCalendar ?? 'google',
				...(selectedGoogleCalendars !== undefined && { selectedGoogleCalendars })
			};

			await db
				.prepare('UPDATE users SET settings = ? WHERE id = ?')
				.bind(JSON.stringify(newSettings), userId)
				.run();

			return json({ success: true });
		}

		// Profile update with name
		if (!name || name.trim().length === 0) {
			throw error(400, 'Name is required');
		}

		// Validate input lengths
		const nameLengthError = validateLength(name, 'Name', MAX_LENGTHS.name, true);
		if (nameLengthError) {
			throw error(400, nameLengthError);
		}

		// Validate brand color if provided
		const colorRegex = /^#[0-9A-Fa-f]{6}$/;
		const validBrandColor = brandColor && colorRegex.test(brandColor) ? brandColor : '#3b82f6';

		// Validate contact email if provided (use robust email validation)
		let validContactEmail: string | null = null;
		if (contactEmail) {
			if (!isValidEmail(contactEmail)) {
				throw error(400, 'Invalid contact email address');
			}
			validContactEmail = contactEmail.trim();
		}

		// Build settings JSON preserving calendar settings
		const settings = JSON.stringify({
			...existingSettings,
			timeFormat: timeFormat === '24h' ? '24h' : '12h'
		});

		// Update user profile
		await db
			.prepare('UPDATE users SET name = ?, profile_image = ?, brand_color = ?, contact_email = ?, settings = ? WHERE id = ?')
			.bind(name.trim(), profileImage || null, validBrandColor, validContactEmail, settings, userId)
			.run();

		return json({ success: true });
	} catch (err: any) {
		console.error('Profile update error:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to update profile');
	}
};

export const POST: RequestHandler = async (event) => {
	const userId = await getCurrentUser(event);
	if (!userId) {
		throw error(401, 'Unauthorized');
	}

	const env = event.platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	try {
		const formData = await event.request.formData();
		const file = formData.get('image') as File;

		if (!file || file.size === 0) {
			throw error(400, 'No image provided');
		}

		// Check file type
		if (!file.type.startsWith('image/')) {
			throw error(400, 'File must be an image');
		}

		// Check file size (max 2MB)
		if (file.size > 2 * 1024 * 1024) {
			throw error(400, 'Image must be less than 2MB');
		}

		// Convert to base64 data URL for storage
		const buffer = await file.arrayBuffer();
		const bytes = new Uint8Array(buffer);

		// Convert to base64 in chunks to avoid stack overflow
		let binary = '';
		const chunkSize = 8192;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			const chunk = bytes.subarray(i, i + chunkSize);
			binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
		}
		const base64 = btoa(binary);
		const dataUrl = `data:${file.type};base64,${base64}`;

		// Update profile image
		await env.DB
			.prepare('UPDATE users SET profile_image = ? WHERE id = ?')
			.bind(dataUrl, userId)
			.run();

		return json({ success: true, imageUrl: dataUrl });
	} catch (err: any) {
		console.error('Image upload error:', err);
		if (err?.status) throw err;
		throw error(500, 'Failed to upload image');
	}
};
