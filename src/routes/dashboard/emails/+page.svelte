<script lang="ts">
	import { onMount } from 'svelte';

	interface EmailTemplate {
		template_type: string;
		name: string;
		description: string;
		default_subject: string;
		id: string | null;
		is_enabled: boolean;
		subject: string;
		custom_message: string | null;
	}

	let templates = $state<EmailTemplate[]>([]);
	let loading = $state(true);
	let saving = $state<string | null>(null);
	let error = $state('');
	let success = $state('');

	// Track which template is expanded for editing
	let expandedTemplate = $state<string | null>(null);

	// Edit states for each template
	let editSubjects = $state<Record<string, string>>({});
	let editMessages = $state<Record<string, string>>({});

	onMount(async () => {
		await fetchTemplates();
	});

	async function fetchTemplates() {
		try {
			const response = await fetch('/api/email-templates');
			if (!response.ok) throw new Error('Failed to fetch templates');
			const data = await response.json() as { templates: EmailTemplate[] };
			templates = data.templates;

			// Initialize edit states
			templates.forEach(t => {
				editSubjects[t.template_type] = t.subject || t.default_subject;
				editMessages[t.template_type] = t.custom_message || '';
			});
		} catch (err: any) {
			error = err.message || 'Failed to load email templates';
		} finally {
			loading = false;
		}
	}

	async function toggleTemplate(template: EmailTemplate) {
		saving = template.template_type;
		error = '';

		try {
			const response = await fetch('/api/email-templates', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					template_type: template.template_type,
					is_enabled: !template.is_enabled,
					subject: editSubjects[template.template_type],
					custom_message: editMessages[template.template_type] || null
				})
			});

			if (!response.ok) throw new Error('Failed to update template');

			// Update local state
			templates = templates.map(t =>
				t.template_type === template.template_type
					? { ...t, is_enabled: !t.is_enabled }
					: t
			);
		} catch (err: any) {
			error = err.message || 'Failed to update template';
		} finally {
			saving = null;
		}
	}

	async function saveTemplate(template: EmailTemplate) {
		saving = template.template_type;
		error = '';
		success = '';

		try {
			const response = await fetch('/api/email-templates', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					template_type: template.template_type,
					is_enabled: template.is_enabled,
					subject: editSubjects[template.template_type],
					custom_message: editMessages[template.template_type] || null
				})
			});

			if (!response.ok) throw new Error('Failed to save template');

			// Update local state
			templates = templates.map(t =>
				t.template_type === template.template_type
					? {
						...t,
						subject: editSubjects[template.template_type],
						custom_message: editMessages[template.template_type] || null
					}
					: t
			);

			success = `${template.name} settings saved`;
			setTimeout(() => success = '', 3000);
			expandedTemplate = null;
		} catch (err: any) {
			error = err.message || 'Failed to save template';
		} finally {
			saving = null;
		}
	}

	function getTemplateIcon(type: string) {
		switch (type) {
			case 'confirmation':
				return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'cancellation':
				return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'reschedule':
				return 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';
			case 'reminder_24h':
			case 'reminder_1h':
			case 'reminder_30m':
				return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
			default:
				return 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';
		}
	}

	function getCategoryLabel(type: string) {
		if (type.startsWith('reminder_')) return 'Reminder';
		return 'Notification';
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white shadow-sm">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			<div class="flex items-center gap-4">
				<a href="/dashboard" class="text-gray-500 hover:text-gray-700">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
					</svg>
				</a>
				<div>
					<h1 class="text-2xl font-bold text-gray-900">Email Settings</h1>
					<p class="text-sm text-gray-600">Manage your automated email notifications</p>
				</div>
			</div>
		</div>
	</header>

	<main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		{#if error}
			<div class="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
				{error}
			</div>
		{/if}

		{#if success}
			<div class="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 mb-6">
				{success}
			</div>
		{/if}

		{#if loading}
			<div class="flex justify-center py-12">
				<div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
			</div>
		{:else}
			<!-- Google Calendar Notice -->
			<div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
				<div class="flex gap-3">
					<svg class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
					<div class="text-sm text-green-800">
						<p class="font-medium mb-1">Calendar Notifications</p>
						<p>Your attendees will always receive calendar invitations with meeting details and video call links (Google Meet or Microsoft Teams). The emails below are <strong>additional</strong> custom notifications you can send.</p>
					</div>
				</div>
			</div>

			<!-- Info Box -->
			<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
				<div class="flex gap-3">
					<svg class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
					<div class="text-sm text-blue-800">
						<p class="font-medium mb-1">Email Variables</p>
						<p>You can use these variables in your subject lines:</p>
						<code class="text-xs bg-blue-100 px-1 py-0.5 rounded">{'{event_name}'}</code>,
						<code class="text-xs bg-blue-100 px-1 py-0.5 rounded">{'{host_name}'}</code>,
						<code class="text-xs bg-blue-100 px-1 py-0.5 rounded">{'{attendee_name}'}</code>,
						<code class="text-xs bg-blue-100 px-1 py-0.5 rounded">{'{date}'}</code>,
						<code class="text-xs bg-blue-100 px-1 py-0.5 rounded">{'{time}'}</code>
					</div>
				</div>
			</div>

			<!-- Notification Emails -->
			<div class="mb-8">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Booking Notifications</h2>
				<div class="space-y-3">
					{#each templates.filter(t => !t.template_type.startsWith('reminder_')) as template}
						<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
							<div class="p-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div class="p-2 bg-gray-100 rounded-lg">
											<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getTemplateIcon(template.template_type)}></path>
											</svg>
										</div>
										<div>
											<h3 class="font-medium text-gray-900">{template.name}</h3>
											<p class="text-sm text-gray-500">{template.description}</p>
										</div>
									</div>
									<div class="flex items-center gap-3">
										<button
											onclick={() => expandedTemplate = expandedTemplate === template.template_type ? null : template.template_type}
											class="text-sm text-blue-600 hover:text-blue-700"
										>
											{expandedTemplate === template.template_type ? 'Close' : 'Edit'}
										</button>
										<label class="relative inline-flex items-center cursor-pointer">
											<input
												type="checkbox"
												checked={template.is_enabled}
												onchange={() => toggleTemplate(template)}
												disabled={saving === template.template_type}
												class="sr-only peer"
											/>
											<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
										</label>
									</div>
								</div>
							</div>

							{#if expandedTemplate === template.template_type}
								<div class="border-t border-gray-200 p-4 bg-gray-50">
									<div class="space-y-4">
										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Subject Line
											</label>
											<input
												type="text"
												bind:value={editSubjects[template.template_type]}
												placeholder={template.default_subject}
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
											/>
										</div>

										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Custom Message (Optional)
											</label>
											<textarea
												bind:value={editMessages[template.template_type]}
												placeholder="Add a personal message that will appear in the email..."
												rows="3"
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
											></textarea>
											<p class="text-xs text-gray-500 mt-1">This message will be added to the email template</p>
										</div>

										<div class="flex justify-end gap-2">
											<button
												onclick={() => expandedTemplate = null}
												class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
											>
												Cancel
											</button>
											<button
												onclick={() => saveTemplate(template)}
												disabled={saving === template.template_type}
												class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
											>
												{saving === template.template_type ? 'Saving...' : 'Save Changes'}
											</button>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Reminder Emails -->
			<div>
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Meeting Reminders</h2>
				<p class="text-sm text-gray-600 mb-4">Automatically remind attendees before their scheduled meetings.</p>
				<div class="space-y-3">
					{#each templates.filter(t => t.template_type.startsWith('reminder_')) as template}
						<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
							<div class="p-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div class="p-2 bg-amber-100 rounded-lg">
											<svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getTemplateIcon(template.template_type)}></path>
											</svg>
										</div>
										<div>
											<h3 class="font-medium text-gray-900">{template.name}</h3>
											<p class="text-sm text-gray-500">{template.description}</p>
										</div>
									</div>
									<div class="flex items-center gap-3">
										<button
											onclick={() => expandedTemplate = expandedTemplate === template.template_type ? null : template.template_type}
											class="text-sm text-blue-600 hover:text-blue-700"
										>
											{expandedTemplate === template.template_type ? 'Close' : 'Edit'}
										</button>
										<label class="relative inline-flex items-center cursor-pointer">
											<input
												type="checkbox"
												checked={template.is_enabled}
												onchange={() => toggleTemplate(template)}
												disabled={saving === template.template_type}
												class="sr-only peer"
											/>
											<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
										</label>
									</div>
								</div>
							</div>

							{#if expandedTemplate === template.template_type}
								<div class="border-t border-gray-200 p-4 bg-gray-50">
									<div class="space-y-4">
										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Subject Line
											</label>
											<input
												type="text"
												bind:value={editSubjects[template.template_type]}
												placeholder={template.default_subject}
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
											/>
										</div>

										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Custom Message (Optional)
											</label>
											<textarea
												bind:value={editMessages[template.template_type]}
												placeholder="Add a personal message that will appear in the reminder..."
												rows="3"
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
											></textarea>
										</div>

										<div class="flex justify-end gap-2">
											<button
												onclick={() => expandedTemplate = null}
												class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
											>
												Cancel
											</button>
											<button
												onclick={() => saveTemplate(template)}
												disabled={saving === template.template_type}
												class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
											>
												{saving === template.template_type ? 'Saving...' : 'Save Changes'}
											</button>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Note about reminders -->
			<div class="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
				<div class="flex gap-3">
					<svg class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
					</svg>
					<div class="text-sm text-amber-800">
						<p class="font-medium">Reminder emails are processed every few minutes</p>
						<p class="mt-1">Reminders are sent automatically based on your settings. Make sure your email configuration is set up correctly in your environment.</p>
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>
