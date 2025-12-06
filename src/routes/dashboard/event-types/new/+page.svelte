<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import SimpleWysiwyg from '$lib/components/SimpleWysiwyg.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let name = $state('');
	let slug = $state('');
	let duration = $state(30);
	let description = $state('');
	let isActive = $state(true);
	let coverImage = $state('');
	let saving = $state(false);
	let uploadingCover = $state(false);

	// Check which calendars are available
	const hasGoogle = data.googleConnected;
	const hasOutlook = data.outlookConnected && data.outlookConfigured;

	// Override checkbox state - defaults to false (use global settings)
	let overrideCalendarSettings = $state(false);

	// Smart defaults based on global settings or connected calendars
	function getDefaultAvailability() {
		if (data.defaultAvailabilityCalendars) return data.defaultAvailabilityCalendars;
		if (hasGoogle && hasOutlook) return 'both';
		if (hasOutlook) return 'outlook';
		return 'google';
	}

	function getDefaultInviteCalendar() {
		if (data.defaultInviteCalendar) return data.defaultInviteCalendar;
		if (hasGoogle) return 'google';
		if (hasOutlook) return 'outlook';
		return 'google';
	}

	let availabilityCalendars = $state(getDefaultAvailability());
	let inviteCalendar = $state(getDefaultInviteCalendar());

	// Labels for displaying current global settings
	function getAvailabilityLabel(val: string) {
		if (val === 'both') return 'Both calendars';
		if (val === 'outlook') return 'Outlook Calendar';
		return 'Google Calendar';
	}

	function getInviteLabel(val: string) {
		if (val === 'outlook') return 'Outlook (Microsoft Teams)';
		return 'Google Calendar (Google Meet)';
	}

	async function handleCoverUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		// Check file size (max 2MB)
		if (file.size > 2 * 1024 * 1024) {
			alert('Image must be less than 2MB');
			return;
		}

		uploadingCover = true;
		try {
			// Convert to base64
			const reader = new FileReader();
			reader.onload = () => {
				coverImage = reader.result as string;
				uploadingCover = false;
			};
			reader.onerror = () => {
				alert('Failed to read image');
				uploadingCover = false;
			};
			reader.readAsDataURL(file);
		} catch (err) {
			alert('Failed to upload image');
			uploadingCover = false;
		}
	}

	function removeCoverImage() {
		coverImage = '';
	}

	// Auto-generate slug from name
	$effect(() => {
		if (name) {
			slug = name
				.toLowerCase()
				.replace(/[^a-z0-9\s-]/g, '')
				.replace(/\s+/g, '-')
				.replace(/-+/g, '-')
				.trim();
		}
	});

	function handleSubmit() {
		saving = true;
		return async ({ update }: any) => {
			await update();
			saving = false;
		};
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white shadow-sm">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			<div class="flex items-center gap-4">
				<a href="/dashboard" class="text-gray-600 hover:text-gray-900">
					← Back to Dashboard
				</a>
				<h1 class="text-2xl font-bold text-gray-900">Create Event Type</h1>
			</div>
		</div>
	</header>

	<main class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		{#if form?.error}
			<div class="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
				Error: {form.error}
			</div>
		{/if}

		<div class="bg-white rounded-lg shadow-sm p-6">
			<form method="POST" use:enhance={handleSubmit}>
				<div class="space-y-6">
					<!-- Event Name -->
					<div>
						<label for="name" class="block text-sm font-medium text-gray-700 mb-2">
							Event Name *
						</label>
						<input
							type="text"
							id="name"
							name="name"
							bind:value={name}
							required
							placeholder="e.g., 30 Minute Meeting"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						/>
					</div>

					<!-- Slug -->
					<div>
						<label for="slug" class="block text-sm font-medium text-gray-700 mb-2">
							URL Slug *
						</label>
						<input
							type="text"
							id="slug"
							name="slug"
							bind:value={slug}
							required
							pattern="[a-z0-9-]+"
							placeholder="e.g., 30min"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						/>
						<p class="text-xs text-gray-500 mt-1">
							Only lowercase letters, numbers, and hyphens. This will be part of your booking URL.
						</p>
					</div>

					<!-- Duration -->
					<div>
						<label for="duration" class="block text-sm font-medium text-gray-700 mb-2">
							Duration (minutes) *
						</label>
						<select
							id="duration"
							name="duration"
							bind:value={duration}
							required
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						>
							<option value={15}>15 minutes</option>
							<option value={30}>30 minutes</option>
							<option value={45}>45 minutes</option>
							<option value={60}>60 minutes</option>
							<option value={90}>90 minutes</option>
							<option value={120}>2 hours</option>
						</select>
					</div>

					<!-- Description -->
					<div>
						<label for="description" class="block text-sm font-medium text-gray-700 mb-2">
							Description
						</label>
						<SimpleWysiwyg
							bind:value={description}
							placeholder="Describe what this meeting is for..."
						/>
						<input type="hidden" name="description" value={description} />
					</div>

					<!-- Cover Image -->
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">
							Cover Image
						</label>
						<p class="text-xs text-gray-500 mb-3">
							This image will be displayed at the top of your booking page
						</p>

						{#if coverImage}
							<div class="relative mb-3 p-4 bg-gray-100 rounded-lg">
								<img
									src={coverImage}
									alt="Cover preview"
									class="max-h-20 w-auto object-contain mx-auto"
								/>
								<button
									type="button"
									onclick={removeCoverImage}
									class="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full hover:bg-red-700 transition"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
									</svg>
								</button>
							</div>
						{/if}

						<label class="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition {coverImage ? 'hidden' : ''}">
							<input
								type="file"
								accept="image/*"
								onchange={handleCoverUpload}
								class="hidden"
								disabled={uploadingCover}
							/>
							{#if uploadingCover}
								<div class="flex items-center gap-2 text-gray-500">
									<div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
									<span>Uploading...</span>
								</div>
							{:else}
								<div class="text-center">
									<svg class="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
									</svg>
									<p class="text-sm text-gray-500">Click to upload cover image</p>
									<p class="text-xs text-gray-400">Max 2MB</p>
								</div>
							{/if}
						</label>
						<input type="hidden" name="cover_image" value={coverImage} />
					</div>

					<!-- Calendar Settings -->
					{#if hasGoogle || hasOutlook}
						<div class="border-t border-gray-200 pt-6">
							<h3 class="text-sm font-medium text-gray-900 mb-4">Calendar Settings</h3>

							<!-- Show current global settings -->
							<div class="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
								<p class="text-gray-600 mb-1">
									<span class="font-medium">Check availability from:</span> {getAvailabilityLabel(getDefaultAvailability())}
								</p>
								<p class="text-gray-600">
									<span class="font-medium">Send invite via:</span> {getInviteLabel(getDefaultInviteCalendar())}
								</p>
								<p class="text-xs text-gray-500 mt-2">
									These are your global settings. <a href="/dashboard" class="text-blue-600 hover:underline">Change in Dashboard</a>
								</p>
							</div>

							<!-- Override checkbox -->
							<div class="flex items-center mb-4">
								<input
									type="checkbox"
									id="override_calendar_settings"
									name="override_calendar_settings"
									bind:checked={overrideCalendarSettings}
									class="h-4 w-4 text-blue-600 rounded border-gray-300"
								/>
								<label for="override_calendar_settings" class="ml-2 text-sm text-gray-700">
									Override global calendar settings for this event type
								</label>
							</div>

							{#if overrideCalendarSettings}
								<!-- Availability Calendars -->
								<div class="mb-4">
									<label for="availability_calendars" class="block text-sm font-medium text-gray-700 mb-2">
										Check availability from
									</label>
									<select
										id="availability_calendars"
										name="availability_calendars"
										bind:value={availabilityCalendars}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									>
										{#if hasGoogle && hasOutlook}
											<option value="both">Both Google & Outlook calendars</option>
										{/if}
										{#if hasGoogle}
											<option value="google">Google Calendar only</option>
										{/if}
										{#if hasOutlook}
											<option value="outlook">Outlook Calendar only</option>
										{/if}
									</select>
									<p class="text-xs text-gray-500 mt-1">
										Which calendars to check when showing available time slots
									</p>
								</div>

								<!-- Invite Calendar -->
								<div>
									<label for="invite_calendar" class="block text-sm font-medium text-gray-700 mb-2">
										Send calendar invite via
									</label>
									<select
										id="invite_calendar"
										name="invite_calendar"
										bind:value={inviteCalendar}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									>
										{#if hasGoogle}
											<option value="google">Google Calendar (with Google Meet)</option>
										{/if}
										{#if hasOutlook}
											<option value="outlook">Outlook Calendar (with Microsoft Teams)</option>
										{/if}
									</select>
									<p class="text-xs text-gray-500 mt-1">
										The attendee will receive an invite from this calendar with the meeting link
									</p>
								</div>
							{/if}
						</div>
					{:else}
						<div class="border-t border-gray-200 pt-6">
							<p class="text-sm text-gray-500">
								Connect a calendar in <a href="/dashboard" class="text-blue-600 hover:underline">Dashboard Settings</a> to configure calendar options.
							</p>
						</div>
					{/if}

					<!-- Is Active -->
					<div class="flex items-center">
						<input
							type="checkbox"
							id="is_active"
							name="is_active"
							bind:checked={isActive}
							class="h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<label for="is_active" class="ml-2 text-sm text-gray-700">
							Active (allow people to book this event type)
						</label>
					</div>

					<!-- Submit -->
					<div class="flex gap-4 pt-4">
						<button
							type="submit"
							disabled={saving}
							class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
						>
							{saving ? 'Creating...' : 'Create Event Type'}
						</button>
						<a
							href="/dashboard"
							class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
						>
							Cancel
						</a>
					</div>
				</div>
			</form>
		</div>
	</main>
</div>
