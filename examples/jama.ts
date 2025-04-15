import {defineService} from '../src/exporter.ts';
import {JamaSession, SecurityType} from './jama/jama-session.ts';

const PROJECT_ID = Deno.env.get('JAMA_PROJECT_ID');
const USERNAME = Deno.env.get('JAMA_USERNAME');
const PASSWORD = Deno.env.get('JAMA_PASSWORD');
const SECURITY = Deno.env.get('JAMA_SECURITY') as SecurityType;

if(!PROJECT_ID || !USERNAME || !PASSWORD) {
	throw new Error(`Must set env vars: JAMA_PROJECT_ID, JAMA_USERNAME, JAMA_PASSWORD`);
}

// hard pagination limit set by jama
const PAGINATION_LIMIT = 50;

export default defineService({
	openApiVersion: '2.0',
	
	async documentLoaded(document) {
		// create jama instance and authenticate
		const k_jama = await JamaSession.create(`https://${document.host}`, USERNAME, PASSWORD, SECURITY);

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
				if('query' === param.in) {
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
		nextOffset(currentOffset, body, operation ) {
			const nl_results = body.data.length as number;
			let offset = currentOffset
			if (operation.operationId === 'getRelationships') {
				offset = body.data.at(-1).id
			} else {
				offset += nl_results;
			}
			return offset
		},
		// produce pagination query args
		nextPage(offset, operation) {
			if ('getRelationships' === operation.operationId) {
				return {
					queryArgs: {
						maxResults: 1000,
						lastId: offset
					}
				};
			}
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
		prepare(path, args) {
			// do not download discovered data from other projects
			if(args?.queryArgs?.project && PROJECT_ID !== args.queryArgs.project) {
				return null;
			}

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
			'/abstractitems',
			'/abstractitems/**',
			'/activities',
			'/activities/**',
			'/comments',
			'/comments/**',
			'/files',
			'/filters',
			'/relationshiprulesets',
			'/relationshiprulesets/**',
			'/system/**',
		].reduce((concat, path) => ({
			...concat,
			[path]: {
				skip: true,
			},
		}), {}),
	},
});
