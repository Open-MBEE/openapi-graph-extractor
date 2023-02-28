import type {
	OpenAPIV2, OpenAPIV3,
	O,
} from '../deps.ts';

import {Promisable} from './belt.ts';
import {Dereference} from './json-schema.ts';

interface ServiceConfigGlobal {
}

/**
 * Arguments that will be stringified and encoded in a specific way when submitting a request
 */
type RequestArgs = Record<string, string | number>;

/**
 * 
 */
export interface RequestConfig {
	/**
	 * Args set in the header of the request
	 */
	headerArgs?: RequestArgs;

	/**
	 * Args appended to the URL search params
	 */
	queryArgs?: RequestArgs;

	/**
	 * Args to substitute into the path template
	 */
	pathArgs?: RequestArgs;

	/**
	 * Args sent in the content body
	 */
	bodyArgs?: RequestArgs;
}

type MethodForPathV2<
	Path extends OpenAPIV2.PathItemObject,
	Method extends OpenAPIV2.HttpMethods=OpenAPIV2.HttpMethods,
> = Path extends {[method in Method]?: OpenAPIV2.OperationObject}
	? Path[Method]
	: never;

export type CompatibleDocument<
	z_document extends object|string|undefined,
> = O.Merge<{
	security?: any;
	securityDefinitions?: any;
}, z_document extends object
	? z_document
	: OpenAPIV2.Document>;



type DeeplyDerefOpsV2<
	g_path extends OpenAPIV2.PathItemObject,
	si_method extends OpenAPIV2.HttpMethods=OpenAPIV2.HttpMethods,
> = Dereference.Deeply<
	NonNullable<
		MethodForPathV2<g_path, si_method>
	>
>;

type OpenApiVersion = '2.0' | '3.0' | '3.1';

type OpenApiDocument<
	s_version extends OpenApiVersion=OpenApiVersion,
> = s_version extends '2.0'
	? OpenAPIV2.Document
	: OpenAPIV3.Document;

export type PathConfigV2<
	g_document extends OpenAPIV2.Document=OpenAPIV2.Document,
	si_path extends keyof g_document['paths']=string,
> = {
	/**
	 * Skips the given path when sweeping/crawling
	 */
	skip?: boolean;

	/**
	 * Allows caller to configure requests made to the given path
	 * @param operation 
	 */
	prepare?(
		operation: DeeplyDerefOpsV2<g_document['paths'][si_path], OpenAPIV2.HttpMethods.GET>,
		args: RequestConfig
	): RequestConfig | null;
}

export type ServiceAugmentation = {
	fetch?(p_url: string, g_opt: RequestInit): ReturnType<typeof window.fetch>;
};

export type ServiceConfigOpenApiV2<
	z_document extends OpenAPIV2.Document|string|undefined=OpenAPIV2.Document,
> = O.MergeAll<z_document extends object|string
	? {
		/**
		 * The loaded OpenAPIv2 JSON document for the data source
		 */
		openApiDocument: CompatibleDocument<z_document>;
	}: {
		/**
		 * The loaded OpenAPIv2 JSON document for the data source
		 */
		openApiDocument?: CompatibleDocument<z_document>;
	}, [{
		/**
		 * The OpenAPI version
		 */
		openApiVersion?: '2.0';

		/**
		 * Gets called immediately after the doument successfully loads
		 */
		documentLoaded?(g_document: CompatibleDocument<z_document>): Promisable<ServiceAugmentation | undefined>;

		/**
		 * Optionally overrides properties defined in the document
		 */
		overrides?: Partial<CompatibleDocument<OpenAPIV2.Document>>;

		/**
		 * Optional config for handling pagination
		 */
		pagination?: {
			/**
			 * The expected result size when paginating
			 */
			limit: number;

			/**
			 * Hook gets called to determine whether the given path requires pagination
			 * @param path - the path being tested
			 * @return `true` if the given path should use pagination
			 */
			requiresPagination(operation: DeeplyDerefOpsV2<z_document extends object
				? z_document['paths'][string]
				: OpenAPIV2.Document['paths'][string]
			>): boolean;

			/**
			 * Hook gets called before each pagination request
			 */
			nextPage(offset: number, operation: Dereference.Deeply<NonNullable<OpenAPIV2.OperationObject>>): RequestConfig;
		};

		/**
		 * Path-specific configs
		 */
		paths?: z_document extends object
			? O.MergeAll<{
				[si_path in keyof z_document['paths']]: PathConfigV2<z_document, si_path>;
			}, [
				{
					[si_path in `${keyof z_document['paths'] & string}/*`]: PathConfigV2<z_document, si_path>;
				}
			]>
			: Record<string, PathConfigV2>;
		
		/**
		 * Config for all paths, applied after path-specific configs
		 */
		allPaths?: z_document extends object
			? PathConfigV2<z_document>
			: PathConfigV2;
	}, ServiceConfigGlobal]>;

// export type ServiceConfig<
// 	z_document extends OpenAPIV2.Document|OpenAPIV3.Document|string|undefined=OpenAPIV2.Document,
// > = z_document extends OpenAPIV2.Document
// 	? z_document extends OpenAPIV3.Document
// 		? never  // TODO: use v3 config once implemented
// 		: ServiceConfigOpenApiV2<z_document>
// 	: z_document extends OpenAPIV3.Document
// 		? never  // TODO: use v3 config once implemented
// 		: ServiceConfigOpenApiV2 | never ;  // TODO: use v3 config once implemented


/**
 * Provides type annotation for the service config object
 * @param gc_service 
 */
export function defineService(gc_service: ServiceConfigOpenApiV2<undefined>): typeof gc_service {
	return gc_service;
}

