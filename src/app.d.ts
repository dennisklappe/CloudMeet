/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				KV: KVNamespace;
				GOOGLE_CLIENT_ID: string;
				GOOGLE_CLIENT_SECRET: string;
				JWT_SECRET: string;
				BASE_URL: string;
				APP_URL?: string;
				ADMIN_EMAIL?: string;
				CF_ACCESS_TEAM_DOMAIN?: string;
				CF_ACCESS_AUD?: string;
				EMAILIT_API_KEY?: string;
				EMAIL_FROM?: string;
				TURNSTILE_SECRET_KEY?: string;
				CRON_SECRET?: string;
			};
			context: {
				waitUntil(promise: Promise<any>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
		interface Locals {
			user?: {
				id: string;
				email: string;
				name: string;
			};
		}
	}
}

export {};