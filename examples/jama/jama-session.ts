import {Dict} from '../../src/belt.ts';

const R_COOKIE = /^([^=]+)=([^;]*)(?:;\s*(.*))?$/;

export type SecurityType = 'web' | 'oauth';

interface Token {
	access_token: string;
	application_data?: Dict;
	expires_in: number;
	jti: string;
	scope: string;
	tenant: string;
	token_type: 'bearer';
};

/**
 * Handles authentication and HTTP session with Jama server
 */
export class JamaSession {
	protected _h_cookies: Record<string, string> = {};
	protected _g_token!: Token | undefined;

	static async create(p_host: string, s_username: string, s_password: string, s_security: SecurityType|undefined='web') {
		const k_session = new JamaSession(p_host);
		await k_session.auth(s_username, s_password, s_security);
		return k_session;
	}

	constructor(protected _p_origin: string) {}

	get origin(): string {
		return this._p_origin;
	}

	async fetch(sr_path: string, gc_fetch: Parameters<typeof fetch>[1]): Promise<Response> {
		const {_p_origin, _h_cookies, _g_token} = this;

		const d_response = await fetch(`${_p_origin}${sr_path}`, {
			...gc_fetch || {},
			headers: {
				...gc_fetch?.headers || {},
				'cookie': Object.entries(_h_cookies)
					.reduce((a_out, [si_key, s_value]) => (a_out.push(`${si_key}=${s_value}`), a_out), [] as string[]).join('; '),
				..._h_cookies['jama-csrf-token']? {
					'jama-csrf-token': _h_cookies['jama-csrf-token'],
				}: {},
				..._g_token? {
					'authorization': `Bearer ${_g_token.access_token}`,
				}: {},
			},
		});

		let p_redirect = '';

		for(const [si_header, s_header_value] of [...d_response.headers]) {
			if('set-cookie' === si_header.toLowerCase()) {
				const [, si_key, s_value, s_extra] = R_COOKIE.exec(s_header_value)!;
				_h_cookies[si_key] = s_value;
			}
			else if('location' === si_header.toLowerCase()) {
				p_redirect = s_header_value;
			}
		}

		// handle manual redirects
		if(302 === d_response.status) {
			return this.fetch(p_redirect.slice(_p_origin.length), {
				method: 'GET',
			});
		}

		return d_response;
	}
		
	async auth(s_username: string, s_password: string, s_security: SecurityType|undefined='web') {
		// oauth
		if('oauth' === s_security) {
			// authenticate
			const d_auth = await this.fetch('/rest/oauth/token', {
				method: 'POST',
				headers: {
					'accept': '*/*',
					'authorization': `Basic ${btoa(s_username+':'+s_password)}`,
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					grant_type: 'client_credentials',
				}).toString(),
			});

			const s_text = await d_auth.text();

			if(!d_auth.ok) {
				throw new Error(`Failed to authenticate, ${d_auth.status}:\n${s_text}`);
			}

			try {
				const g_token = JSON.parse(s_text);
				if('string' !== typeof g_token.access_token || 'bearer' !== g_token.token_type) {
					throw new Error(s_text);
				}

				this._g_token = g_token;
			}
			catch(e_parse) {
				throw new Error(`Server returned an invalid access token: ${s_text}`);
			}
		}
		// web auth
		else {
			// absorb cookies from plain fetch
			await this.fetch('/api-docs', {
				method: 'GET',
				redirect: 'manual',
			});

			// authenticate
			const d_auth = await this.fetch('/j_acegi_security_check', {
				method: 'POST',
				headers: {
					'accept': 'text/html',
					'content-type': 'application/x-www-form-urlencoded',
					'referer': `${this._p_origin}/login.req`,
					'referrer-policy': 'strict-origin-when-cross-origin',
				},
				body: new URLSearchParams({
					j_username: s_username,
					j_password: s_password,
				}).toString(),
			});

			const s_text = await d_auth.text();

			if(!d_auth.ok) {
				throw new Error(`Failed to authenticate, ${d_auth.status}:\n${s_text}`);
			}
		}
	}
}