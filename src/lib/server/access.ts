/**
 * Cloudflare Access (Zero Trust) login
 * Verifies the Cf-Access-Jwt-Assertion header that Access adds to requests
 * once the dashboard is protected by an Access application.
 */

interface AccessEnv {
	CF_ACCESS_TEAM_DOMAIN?: string;
	CF_ACCESS_AUD?: string;
	ADMIN_EMAIL?: string;
}

interface Jwk {
	kid: string;
	kty: string;
	alg?: string;
	n: string;
	e: string;
}

interface AccessClaims {
	aud: string[] | string;
	email?: string;
	iss: string;
	exp: number;
	nbf?: number;
	name?: string;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { domain: string; keys: Jwk[]; fetchedAt: number } | null = null;

export function isAccessConfigured(env: AccessEnv | undefined): boolean {
	return !!(env?.CF_ACCESS_TEAM_DOMAIN && env?.CF_ACCESS_AUD);
}

function normalizeTeamDomain(domain: string): string {
	const host = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
	return host.includes('.') ? host : `${host}.cloudflareaccess.com`;
}

function base64UrlToBytes(input: string): Uint8Array {
	const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
	const binary = atob(padded);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJson<T>(input: string): T {
	return JSON.parse(new TextDecoder().decode(base64UrlToBytes(input)));
}

async function getKeys(domain: string, forceRefresh = false): Promise<Jwk[]> {
	if (!forceRefresh && jwksCache && jwksCache.domain === domain && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
		return jwksCache.keys;
	}
	const response = await fetch(`https://${domain}/cdn-cgi/access/certs`);
	if (!response.ok) {
		throw new Error(`Failed to fetch Access certs: ${response.status}`);
	}
	const { keys } = (await response.json()) as { keys: Jwk[] };
	jwksCache = { domain, keys, fetchedAt: Date.now() };
	return keys;
}

/**
 * Verify an Access JWT and return the authenticated email, or null if invalid.
 */
export async function verifyAccessJwt(token: string, env: AccessEnv): Promise<{ email: string; name?: string } | null> {
	if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;

	try {
		const domain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
		const [headerB64, payloadB64, signatureB64] = token.split('.');
		if (!headerB64 || !payloadB64 || !signatureB64) return null;

		const header = decodeJson<{ alg: string; kid: string }>(headerB64);
		if (header.alg !== 'RS256') return null;

		let jwk = (await getKeys(domain)).find((k) => k.kid === header.kid);
		if (!jwk) {
			// Keys rotate: refetch once before rejecting
			jwk = (await getKeys(domain, true)).find((k) => k.kid === header.kid);
		}
		if (!jwk) return null;

		const key = await crypto.subtle.importKey(
			'jwk',
			jwk as unknown as JsonWebKey,
			{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
			false,
			['verify']
		);
		const valid = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			key,
			base64UrlToBytes(signatureB64),
			new TextEncoder().encode(`${headerB64}.${payloadB64}`)
		);
		if (!valid) return null;

		const claims = decodeJson<AccessClaims>(payloadB64);
		const now = Math.floor(Date.now() / 1000);
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

		if (claims.iss !== `https://${domain}`) return null;
		if (!audiences.includes(env.CF_ACCESS_AUD)) return null;
		if (claims.exp <= now || (claims.nbf && claims.nbf > now)) return null;
		if (!claims.email) return null;

		// Same restriction as the Google login: only the admin may enter
		if (env.ADMIN_EMAIL && claims.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return null;

		return { email: claims.email, name: claims.name };
	} catch (err) {
		console.error('Access JWT verification failed:', err);
		return null;
	}
}

/**
 * Find the user for a verified Access identity, creating the row on first login.
 * Calendar tokens are added later by connecting a calendar in the dashboard.
 */
export async function getOrCreateAccessUser(db: D1Database, identity: { email: string; name?: string }): Promise<string> {
	const existing = await db
		.prepare('SELECT id FROM users WHERE lower(email) = lower(?)')
		.bind(identity.email)
		.first<{ id: string }>();
	if (existing) return existing.id;

	const id = crypto.randomUUID();
	const slug = identity.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
	await db
		.prepare('INSERT INTO users (id, email, name, slug) VALUES (?, ?, ?, ?)')
		.bind(id, identity.email, identity.name || identity.email.split('@')[0], slug)
		.run();
	return id;
}
