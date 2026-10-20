/**
 * Health check endpoint
 * Reports whether the database, KV and the main configuration are in place.
 * Never returns secret values, only whether they are set.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	const env = platform?.env;
	if (!env) {
		return json({ ok: false, error: 'Platform env not available' }, { status: 500 });
	}

	const checks: Record<string, { ok: boolean; detail?: string }> = {};

	try {
		await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first();
		checks.database = { ok: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		checks.database = {
			ok: false,
			detail: message.includes('no such table')
				? 'Tables missing: run `npx wrangler d1 execute cloudmeet-db --remote --file=schema.sql`'
				: message
		};
	}

	try {
		await env.KV.get('health-check');
		checks.kv = { ok: true };
	} catch (err) {
		checks.kv = { ok: false, detail: err instanceof Error ? err.message : 'Unknown error' };
	}

	const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET', 'APP_URL', 'ADMIN_EMAIL'].filter(
		(name) => !(env as unknown as Record<string, string | undefined>)[name]
	);
	// A trailing newline in a secret breaks OAuth without any error
	const malformed = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET', 'APP_URL']
		.filter((name) => {
			const value = (env as unknown as Record<string, string | undefined>)[name];
			return value && value !== value.trim();
		});
	checks.config = {
		ok: missing.length === 0 && malformed.length === 0,
		detail:
			[
				missing.length ? `Missing: ${missing.join(', ')}` : '',
				malformed.length ? `Whitespace or newline at the start or end of: ${malformed.join(', ')}` : ''
			]
				.filter(Boolean)
				.join('. ') || undefined
	};

	const ok = Object.values(checks).every((c) => c.ok);
	return json({ ok, checks }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
};
