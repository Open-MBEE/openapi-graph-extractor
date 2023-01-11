import {defineService} from '../src/exporter.ts';
import {JamaSession} from './jama/jama-session.ts';

const PROJECT_ID = Deno.env.get('JAMA_PROJECT_ID');
const USERNAME = Deno.env.get('JAMA_USERNAME');
const PASSWORD = Deno.env.get('JAMA_PASSWORD');

if(!PROJECT_ID || !USERNAME || !PASSWORD) {
	throw new Error(`Must set env vars: JAMA_PROJECT_ID, JAMA_USERNAME, JAMA_PASSWORD`);
}

// hard pagination limit set by jama
const PAGINATION_LIMIT = 50;

export default defineService({
	openApiVersion: '2.0',
	
	async documentLoaded(document) {
		// create jama instance and authenticate
		const k_jama = await JamaSession.create(`https://${document.host}`, USERNAME, PASSWORD);

		// use for fetch
		return {
			fetch(url, options) {
				if(url.startsWith(k_jama.origin)) {
					return k_jama.fetch(url.slice(k_jama.origin.length), options);
				}
				else {
					return fetch(url, options);
				}
			}
		};
	},

	pagination: {
		limit: PAGINATION_LIMIT,

		// any Jama path that includes `startAt` and `maxResults` as path params requires pagination
		requiresPagination(operation) {
			let paginationParams = 0;

			for(const param of operation.parameters || []) {
				if('path' === param.in) {
					if('startAt' === param.name) {
						paginationParams |= 1 << 0;
					}
					else if('maxResults' === param.name) {
						paginationParams |= 1 << 1;
					}
				}
			}

			return paginationParams === 0b11;
		},

		// produce pagination query args
		nextPage(offset) {
			return {
				queryArgs: {
					startAt: offset,
					maxResults: PAGINATION_LIMIT,
				},
			};
		},
	},

	
	allPaths: {
		// any Jama path that includes `project` path param should receive the current project ID
		prepare(path) {
			const pathArgs: Record<string, string> = {};
			const queryArgs: Record<string, string> = {};

			for(const param of path.parameters || []) {
				if('query' === param.in) {
					if('project' === param.name) {
						queryArgs.project = PROJECT_ID;
					}
				}
				else if('path' === param.in) {
					if('projectId' === param.name) {
						pathArgs.projectId = PROJECT_ID;
					}
				}
			}

			return {
				pathArgs,
				queryArgs,
			};
		},
	},

	paths: {
		// omit certain data
		...[
			'/activities/adminActivity',
			'/system/settings/corsdomains',
			'/relationshiprulesets',
		].reduce((concat, path) => ({
			...concat,
			[path]: {
				skip: true,
			},
		}), {}),
	},
});
