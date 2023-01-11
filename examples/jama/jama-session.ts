const R_COOKIE = /^([^=]+)=([^;]*)(?:;\s*(.*))?$/;

/**
 * Handles authentication and HTTP session with Jama server
 */
export class JamaSession {
	protected _h_cookies: Record<string, string> = {};

	static async create(p_host: string, s_username: string, s_password: string) {
		const k_session = new JamaSession(p_host);
		await k_session.auth(s_username, s_password);
		return k_session;
	}

	constructor(protected _p_origin: string) {}

	get origin(): string {
		return this._p_origin;
	}

	async fetch(sr_path: string, gc_fetch: Parameters<typeof fetch>[1]): Promise<Response> {
		const d_response = await fetch(`${this._p_origin}${sr_path}`, {
			...gc_fetch || {},
			headers: {
				...gc_fetch?.headers || {},
				cookie: Object.entries(this._h_cookies)
					.reduce((a_out, [si_key, s_value]) => (a_out.push(`${si_key}=${s_value}`), a_out), [] as string[]).join('; '),
				...this._h_cookies['jama-csrf-token']? {
					'jama-csrf-token': this._h_cookies['jama-csrf-token'],
				}: {},
			},
		});

		let p_redirect = '';

		for(const [si_header, s_header_value] of d_response.headers.entries()) {
			if('set-cookie' === si_header.toLowerCase()) {
				const [, si_key, s_value, s_extra] = R_COOKIE.exec(s_header_value)!;
				this._h_cookies[si_key] = s_value;
			}
			else if('location' === si_header.toLowerCase()) {
				p_redirect = s_header_value;
			}
		}

		if(302 === d_response.status) {
			return this.fetch(p_redirect.slice(this._p_origin.length), {
				method: 'GET',
			});
		}

		return d_response;
	}
		
	async auth(s_username: string, s_password: string) {
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
				'Referer': `${this._p_origin}/login.req`,
				'Referrer-Policy': 'strict-origin-when-cross-origin',
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