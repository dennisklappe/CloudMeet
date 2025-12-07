<script lang="ts">
	import { browser } from '$app/environment';
	import type { BrandColors } from '$lib/utils/colorUtils';
	import { formatSelectedDate } from '$lib/utils/dateFormatters';

	interface Props {
		user: {
			profileImage?: string | null;
			name?: string;
		} | null;
		eventType: {
			name: string;
			duration: number;
			description?: string | null;
			cover_image?: string | null;
			invite_calendar?: string | null;
		} | null;
		selectedDate: string | null;
		selectedSlot: { start: string; end: string } | null;
		brandColor: string;
		formatTime: (isoStr: string) => string;
	}

	let {
		user,
		eventType,
		selectedDate,
		selectedSlot,
		brandColor,
		formatTime
	}: Props = $props();

	// Sanitize event description to prevent XSS (only in browser, SSR uses raw since admin-entered)
	let sanitizedDescription = $state('');
	$effect(() => {
		if (eventType?.description) {
			if (browser) {
				import('isomorphic-dompurify').then(({ default: DOMPurify }) => {
					sanitizedDescription = DOMPurify.sanitize(eventType.description!);
				});
			} else {
				// During SSR, escape basic HTML entities as a fallback
				sanitizedDescription = eventType.description
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;');
			}
		} else {
			sanitizedDescription = '';
		}
	});

	const meetingLabel = eventType?.invite_calendar === 'outlook' ? 'Microsoft Teams' : 'Google Meet';
</script>

<div class="w-72 border-r border-gray-200 flex flex-col flex-shrink-0">
	{#if eventType?.cover_image}
		<div class="p-6 pb-4 flex justify-center">
			<img src={eventType.cover_image} alt="" class="max-h-16 w-auto object-contain" />
		</div>
		<div class="border-b border-gray-200 mx-6"></div>
	{/if}

	<div class="flex-1 p-6">
		<div class="mb-6">
			{#if user?.profileImage}
				<img src={user.profileImage} alt={user.name} class="w-12 h-12 rounded-full object-cover mb-3" />
			{:else}
				<div class="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg mb-3" style="background-color: {brandColor}">
					{user?.name?.charAt(0) || 'M'}
				</div>
			{/if}
			<p class="text-sm font-medium text-gray-600 mb-1">{user?.name || 'Host'}</p>
			<h1 class="text-2xl font-bold text-gray-900">{eventType?.name || 'Meeting'}</h1>
		</div>

		<div class="space-y-4 text-sm text-gray-600">
			<div class="flex items-center gap-3">
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<span>{eventType?.duration} min</span>
			</div>
			<div class="flex items-center gap-3">
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
				</svg>
				<span>{meetingLabel}</span>
			</div>
		</div>

		{#if eventType?.description}
			<div class="mt-6 pt-6 border-t border-gray-200">
				<div class="text-sm text-gray-600 prose prose-sm max-w-none [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1">
					{@html sanitizedDescription}
				</div>
			</div>
		{/if}

		{#if selectedDate && selectedSlot}
			<div class="mt-6 pt-6 border-t border-gray-200">
				<div class="flex items-center gap-3 text-sm">
					<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
					</svg>
					<div>
						<p class="font-medium text-gray-900">{formatTime(selectedSlot.start)} - {formatTime(selectedSlot.end)}</p>
						<p class="text-gray-500">{formatSelectedDate(selectedDate)}</p>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
