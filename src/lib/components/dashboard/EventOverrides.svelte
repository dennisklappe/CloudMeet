<script lang="ts">
	interface Props {
		bufferMinutes?: number;
		minNoticeMinutes?: number | null;
		maxAdvanceDays?: number | null;
		/** Existing custom hours, or null/undefined when the event follows the global schedule */
		rules?: Array<{ day_of_week: number; start_time: string; end_time: string }> | null;
	}

	let { bufferMinutes = 0, minNoticeMinutes = null, maxAdvanceDays = null, rules = null }: Props = $props();

	const days = [
		{ id: 1, name: 'Monday' },
		{ id: 2, name: 'Tuesday' },
		{ id: 3, name: 'Wednesday' },
		{ id: 4, name: 'Thursday' },
		{ id: 5, name: 'Friday' },
		{ id: 6, name: 'Saturday' },
		{ id: 0, name: 'Sunday' }
	];

	let buffer = $state(bufferMinutes);
	let minNotice = $state(minNoticeMinutes === null ? '' : String(minNoticeMinutes));
	let maxAdvance = $state(maxAdvanceDays === null ? '' : String(maxAdvanceDays));
	let customHours = $state(!!rules?.length);
	let schedule = $state(
		days.map((d) => {
			const existing = rules?.find((r) => r.day_of_week === d.id);
			return {
				day: d.id,
				name: d.name,
				enabled: rules?.length ? !!existing : d.id >= 1 && d.id <= 5,
				startTime: existing?.start_time || '09:00',
				endTime: existing?.end_time || '17:00'
			};
		})
	);

	const hoursJson = $derived(
		JSON.stringify(schedule.map(({ day, enabled, startTime, endTime }) => ({ day, enabled, startTime, endTime })))
	);
	const inputClass =
		'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent';
</script>

<div class="border-t border-gray-200 pt-6">
	<h3 class="text-sm font-medium text-gray-900 mb-4">Booking Rules</h3>

	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
		<div>
			<label for="buffer_minutes" class="block text-sm font-medium text-gray-700 mb-2">Buffer (minutes)</label>
			<input type="number" id="buffer_minutes" name="buffer_minutes" min="0" max="240" step="5" bind:value={buffer} class={inputClass} />
			<p class="text-xs text-gray-500 mt-1">Free time kept before and after other events</p>
		</div>
		<div>
			<label for="min_notice_minutes" class="block text-sm font-medium text-gray-700 mb-2">Minimum notice (minutes)</label>
			<input type="number" id="min_notice_minutes" name="min_notice_minutes" min="0" step="15" placeholder="None" bind:value={minNotice} class={inputClass} />
			<p class="text-xs text-gray-500 mt-1">Empty means no minimum</p>
		</div>
		<div>
			<label for="max_advance_days" class="block text-sm font-medium text-gray-700 mb-2">Booking window (days)</label>
			<input type="number" id="max_advance_days" name="max_advance_days" min="1" max="365" placeholder="60" bind:value={maxAdvance} class={inputClass} />
			<p class="text-xs text-gray-500 mt-1">Empty means 60 days</p>
		</div>
	</div>

	<div class="flex items-center mb-4">
		<input type="checkbox" id="custom_hours" name="custom_hours" bind:checked={customHours} class="h-4 w-4 text-blue-600 rounded border-gray-300" />
		<label for="custom_hours" class="ml-2 text-sm text-gray-700">
			Use custom hours for this event type (instead of your global availability)
		</label>
	</div>

	{#if customHours}
		<div class="space-y-2">
			{#each schedule as row (row.day)}
				<div class="flex items-center gap-3">
					<label class="flex items-center gap-2 w-32 text-sm text-gray-700">
						<input type="checkbox" bind:checked={row.enabled} class="h-4 w-4 text-blue-600 rounded border-gray-300" />
						{row.name}
					</label>
					{#if row.enabled}
						<input type="time" bind:value={row.startTime} aria-label="{row.name} start" class="px-2 py-1 border border-gray-300 rounded-md" />
						<span class="text-gray-400">to</span>
						<input type="time" bind:value={row.endTime} aria-label="{row.name} end" class="px-2 py-1 border border-gray-300 rounded-md" />
					{:else}
						<span class="text-sm text-gray-400">Unavailable</span>
					{/if}
				</div>
			{/each}
		</div>
		<input type="hidden" name="hours_json" value={hoursJson} />
	{/if}
</div>
