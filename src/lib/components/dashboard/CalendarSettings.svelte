<script lang="ts">
	import { onMount } from 'svelte';

	interface GoogleCalendar {
		id: string;
		summary: string;
		primary?: boolean;
	}

	interface Props {
		user: {
			googleConnected?: boolean;
			outlookConnected?: boolean;
			defaultAvailabilityCalendars?: 'google' | 'outlook' | 'both';
			defaultInviteCalendar?: 'google' | 'outlook';
			selectedGoogleCalendars?: string[];
		} | null;
		outlookConfigured: boolean;
	}

	let { user, outlookConfigured }: Props = $props();

	let error = $state('');
	let saving = $state(false);
	let loadingCalendars = $state(false);
	let googleCalendars = $state<GoogleCalendar[]>([]);
	let selectedCalendarIds = $state<Set<string>>(new Set(user?.selectedGoogleCalendars || []));

	// Calendar settings with smart defaults
	const hasGoogle = user?.googleConnected ?? false;
	const hasOutlook = (user?.outlookConnected ?? false) && outlookConfigured;

	function getDefaultAvailability(): 'google' | 'outlook' | 'both' {
		if (user?.defaultAvailabilityCalendars) return user.defaultAvailabilityCalendars;
		if (hasGoogle && hasOutlook) return 'both';
		if (hasOutlook) return 'outlook';
		return 'google';
	}

	function getDefaultInvite(): 'google' | 'outlook' {
		if (user?.defaultInviteCalendar) return user.defaultInviteCalendar;
		if (hasGoogle) return 'google';
		if (hasOutlook) return 'outlook';
		return 'google';
	}

	let availabilityCalendars = $state(getDefaultAvailability());
	let inviteCalendar = $state(getDefaultInvite());

	// Load Google calendars on mount
	onMount(async () => {
		if (hasGoogle) {
			await loadGoogleCalendars();
		}
	});

	async function loadGoogleCalendars() {
		loadingCalendars = true;
		try {
			const response = await fetch('/api/calendars/google');
			if (response.ok) {
				const data = await response.json();
				googleCalendars = data.calendars;
				// If no calendars selected yet, select all by default
				if (selectedCalendarIds.size === 0 && googleCalendars.length > 0) {
					selectedCalendarIds = new Set(googleCalendars.map(c => c.id));
				}
			}
		} catch (err) {
			console.error('Failed to load Google calendars:', err);
		} finally {
			loadingCalendars = false;
		}
	}

	function toggleCalendar(calendarId: string) {
		const newSet = new Set(selectedCalendarIds);
		if (newSet.has(calendarId)) {
			newSet.delete(calendarId);
		} else {
			newSet.add(calendarId);
		}
		selectedCalendarIds = newSet;
	}

	async function saveCalendarSettings() {
		saving = true;
		error = '';
		try {
			const response = await fetch('/api/profile', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					defaultAvailabilityCalendars: availabilityCalendars,
					defaultInviteCalendar: inviteCalendar,
					selectedGoogleCalendars: Array.from(selectedCalendarIds)
				})
			});
			if (!response.ok) throw new Error('Failed to save');
		} catch (err) {
			error = 'Failed to save calendar settings';
		} finally {
			saving = false;
		}
	}

	async function disconnectOutlook() {
		if (!confirm('Are you sure you want to disconnect your Outlook calendar?')) return;

		try {
			const form = document.createElement('form');
			form.method = 'POST';
			form.action = '/auth/outlook/disconnect';
			document.body.appendChild(form);
			form.submit();
		} catch (err) {
			error = 'Failed to disconnect Outlook';
		}
	}
</script>

<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
	<h3 class="text-lg font-semibold text-gray-900 mb-2">Calendar Integrations</h3>
	<p class="text-sm text-gray-600 mb-4">
		Connect your calendars to check availability and send invites.
	</p>

	{#if error}
		<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
			{error}
		</div>
	{/if}

	<div class="space-y-4">
		<!-- Google Calendar -->
		<div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm">
					<!-- Google Calendar icon -->
					<svg class="w-6 h-6" viewBox="0 0 512 512" fill="none">
						<path d="M390.736 121.264H121.264V390.736H390.736V121.264Z" fill="white"/>
						<path d="M390.736 512L512 390.736L451.368 380.392L390.736 390.736L379.67 446.196L390.736 512Z" fill="#EA4335"/>
						<path d="M0 390.736V471.578C0 493.912 18.088 512 40.42 512H121.264L133.714 451.368L121.264 390.736L55.198 380.392L0 390.736Z" fill="#188038"/>
						<path d="M512 121.264V40.42C512 18.088 493.912 0 471.58 0H390.736C383.36 30.072 379.671 52.2027 379.67 66.392C379.67 80.58 383.359 98.8707 390.736 121.264C417.556 128.944 437.767 132.784 451.368 132.784C464.969 132.784 485.18 128.945 512 121.264Z" fill="#1967D2"/>
						<path d="M512 121.264H390.736V390.736H512V121.264Z" fill="#FBBC04"/>
						<path d="M390.736 390.736H121.264V512H390.736V390.736Z" fill="#34A853"/>
						<path d="M390.736 0H40.422C18.088 0 0 18.088 0 40.42V390.736H121.264V121.264H390.736V0Z" fill="#4285F4"/>
						<path d="M176.54 330.308C166.468 323.504 159.494 313.568 155.688 300.428L179.066 290.796C181.186 298.88 184.891 305.145 190.182 309.592C195.436 314.038 201.836 316.228 209.314 316.228C216.959 316.228 223.527 313.903 229.018 309.254C234.51 304.606 237.272 298.678 237.272 291.504C237.272 284.16 234.375 278.164 228.582 273.516C222.788 268.868 215.512 266.544 206.822 266.544H193.314V243.404H205.44C212.917 243.404 219.216 241.382 224.336 237.338C229.456 233.298 232.016 227.772 232.016 220.732C232.016 214.468 229.726 209.482 225.146 205.744C220.566 202.004 214.77 200.118 207.73 200.118C200.858 200.118 195.402 201.938 191.36 205.608C187.319 209.289 184.282 213.937 182.534 219.116L159.394 209.482C162.458 200.792 168.084 193.112 176.336 186.476C184.588 179.84 195.132 176.506 207.932 176.506C217.398 176.506 225.92 178.326 233.466 181.996C241.01 185.668 246.938 190.754 251.216 197.222C255.496 203.722 257.616 210.998 257.616 219.082C257.616 227.334 255.63 234.308 251.656 240.034C247.682 245.76 242.796 250.138 237.002 253.204V254.584C244.483 257.669 250.982 262.735 255.798 269.238C260.682 275.806 263.142 283.654 263.142 292.818C263.142 301.978 260.816 310.164 256.168 317.338C251.52 324.514 245.088 330.172 236.934 334.282C228.75 338.392 219.554 340.482 209.348 340.482C197.524 340.514 186.612 337.112 176.54 330.308ZM320.132 214.298L294.466 232.858L281.632 213.39L327.678 180.176H345.328V336.842H320.132V214.298Z" fill="#4285F4"/>
					</svg>
				</div>
				<div>
					<h4 class="font-medium text-gray-900">Google Calendar</h4>
					<p class="text-sm text-gray-600">
						{#if user?.googleConnected}
							<span class="text-green-600">Connected</span> <span class="text-gray-500">(via login)</span>
						{:else}
							<span class="text-gray-500">Not connected</span>
						{/if}
					</p>
				</div>
			</div>
		</div>

		<!-- Outlook Calendar -->
		<div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm">
					<!-- Microsoft Outlook icon -->
					<svg class="w-6 h-6" viewBox="0 0 48 48">
						<path fill="#40c4ff" d="M31.323,8.502L7.075,23.872l-2.085-3.29v-2.835c0-1.032,0.523-1.994,1.389-2.556l14.095-9.146c2.147-1.393,4.914-1.394,7.061-0.001L31.323,8.502z"/>
						<path fill="#1976d2" d="M27.317,5.911c0.073,0.043,0.145,0.088,0.217,0.135l11,7.136L11.259,30.47l-4.185-6.603l20.017-12.713C28.988,9.95,29.071,7.241,27.317,5.911z"/>
						<path fill="#0d47a1" d="M22.142,33.771L11.26,30.47l23.136-14.666c1.949-1.235,1.944-4.08-0.009-5.308l-0.104-0.065l0.3,0.186l7.041,4.568c0.866,0.562,1.389,1.524,1.389,2.556v2.744L22.142,33.771z"/>
						<path fill="#29b6f6" d="M20.886,43h15.523c3.646,0,6.602-2.956,6.602-6.602V17.797c0,1.077-0.554,2.079-1.466,2.652l-23.09,14.498c-1.246,0.782-2.001,2.15-2.001,3.62C16.454,41.016,18.438,43,20.886,43z"/>
						<path fill="#80d8ff" d="M27.198,42.999H11.589c-3.646,0-6.602-2.956-6.602-6.602V17.783c0,1.076,0.552,2.076,1.461,2.649l23.067,14.543c1.263,0.796,2.029,2.185,2.029,3.678C31.544,41.053,29.598,42.999,27.198,42.999z"/>
						<path fill="#1565c0" d="M6.453,23h10.094C18.454,23,20,24.546,20,26.453v10.094C20,38.454,18.454,40,16.547,40H6.453C4.546,40,3,38.454,3,36.547V26.453C3,24.546,4.546,23,6.453,23z"/>
						<path fill="#fff" d="M11.453,36.518c-1.4,0-2.55-0.452-3.449-1.355c-0.899-0.903-1.348-2.082-1.348-3.537c0-1.536,0.456-2.778,1.369-3.726c0.913-0.949,2.107-1.423,3.584-1.423c1.396,0,2.532,0.454,3.408,1.362c0.881,0.908,1.321,2.105,1.321,3.591c0,1.527-0.456,2.758-1.369,3.692C14.061,36.053,12.889,36.518,11.453,36.518z M11.493,34.601c0.763,0,1.378-0.269,1.843-0.806c0.465-0.538,0.698-1.285,0.698-2.243c0-0.998-0.226-1.775-0.677-2.331c-0.452-0.556-1.055-0.833-1.809-0.833c-0.777,0-1.403,0.287-1.877,0.861c-0.474,0.569-0.711,1.323-0.711,2.263c0,0.953,0.237,1.707,0.711,2.263C10.145,34.326,10.752,34.601,11.493,34.601z"/>
					</svg>
				</div>
				<div>
					<h4 class="font-medium text-gray-900">Outlook Calendar</h4>
					<p class="text-sm">
						{#if !outlookConfigured}
							<span class="text-gray-500">Not configured</span>
						{:else if user?.outlookConnected}
							<span class="text-green-600">Connected</span>
						{:else}
							<span class="text-gray-500">Not connected</span>
						{/if}
					</p>
				</div>
			</div>
			{#if outlookConfigured}
				{#if user?.outlookConnected}
					<button
						onclick={disconnectOutlook}
						class="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
					>
						Disconnect
					</button>
				{:else}
					<a
						href="/auth/outlook"
						class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
					>
						Connect
					</a>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Global Calendar Settings -->
	{#if hasGoogle || hasOutlook}
		<div class="mt-6 pt-6 border-t border-gray-200">
			<h4 class="font-medium text-gray-900 mb-1">Default Calendar Settings</h4>
			<p class="text-sm text-gray-600 mb-4">
				These settings apply to all event types unless overridden.
			</p>

			<div class="space-y-4">
				<!-- Check availability from -->
				<div>
					<label for="availabilityCalendars" class="block text-sm font-medium text-gray-700 mb-1">
						Check availability from
					</label>
					<select
						id="availabilityCalendars"
						bind:value={availabilityCalendars}
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						{#if hasGoogle}
							<option value="google">Google Calendar only</option>
						{/if}
						{#if hasOutlook}
							<option value="outlook">Outlook Calendar only</option>
						{/if}
						{#if hasGoogle && hasOutlook}
							<option value="both">Both calendars</option>
						{/if}
					</select>
				</div>

				<!-- Google Calendar Selection -->
				{#if hasGoogle && (availabilityCalendars === 'google' || availabilityCalendars === 'both')}
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">
							Google calendars to check
						</label>
						{#if loadingCalendars}
							<p class="text-sm text-gray-500">Loading calendars...</p>
						{:else if googleCalendars.length === 0}
							<p class="text-sm text-gray-500">No calendars found</p>
						{:else}
							<div class="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
								{#each googleCalendars as calendar}
									<label class="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											checked={selectedCalendarIds.has(calendar.id)}
											onchange={() => toggleCalendar(calendar.id)}
											class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
										/>
										<span class="text-sm text-gray-700">
											{calendar.summary}
											{#if calendar.primary}
												<span class="text-xs text-gray-500">(Primary)</span>
											{/if}
										</span>
									</label>
								{/each}
							</div>
							<p class="text-xs text-gray-500 mt-1">
								Selected: {selectedCalendarIds.size} of {googleCalendars.length}
							</p>
						{/if}
					</div>
				{/if}

				<!-- Send calendar invite via -->
				<div>
					<label for="inviteCalendar" class="block text-sm font-medium text-gray-700 mb-1">
						Send calendar invite via
					</label>
					<select
						id="inviteCalendar"
						bind:value={inviteCalendar}
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						{#if hasGoogle}
							<option value="google">Google Calendar (Google Meet)</option>
						{/if}
						{#if hasOutlook}
							<option value="outlook">Outlook Calendar (Microsoft Teams)</option>
						{/if}
					</select>
				</div>

				<button
					onclick={saveCalendarSettings}
					disabled={saving}
					class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
				>
					{saving ? 'Saving...' : 'Save Settings'}
				</button>
			</div>
		</div>
	{/if}
</div>
