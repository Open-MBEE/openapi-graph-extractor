import * as path from "https://deno.land/std@0.171.0/path/mod.ts";

import yargs from "https://deno.land/x/yargs@v17.6.2-deno/deno.ts"
import {Arguments} from "https://deno.land/x/yargs@v17.6.2-deno/deno-types.ts"
import {YargsInstance} from 'https://deno.land/x/yargs@v17.6.2-deno/build/lib/yargs-factory.d.ts';

import type {OpenAPIV2, OpenAPIV3} from 'npm:openapi-types@12.1.0';
import {parse as parseYaml} from 'npm:yaml@2.2.1';

import {extract} from './extract.ts';
import { CompatibleDocument, ServiceConfigOpenApiV2 } from "./exporter.ts";

yargs(Deno.args)
	.command('extract <config-script> [api-document]', 'run the extraction using the given congiruation script and optionally OpenAPI document',
		(y_yargs_extract: YargsInstance) => y_yargs_extract
			.positional('config-script', {
				describe: 'the configuration script as JavaScript or TypeScript',
			})
			.positional('api-document', {
				describe: 'the OpenAPI document can be a local file or remote URL, and be either in JSON or YAML format',
			}),
		async(g_argv: Arguments) => {
			// import the configuration script
			let gc_service: ServiceConfigOpenApiV2<OpenAPIV2.Document>;
			try {
				console.log(Deno.cwd());
				const p_script = path.resolve(Deno.cwd(), g_argv.configScript);

				({default:gc_service} = await import(p_script));
			}
			catch(e_import) {
				throw new Error(`Failed to import the configuration script: ${e_import.message}`);
			}

			// path to document
			let p_document = g_argv.apiDocument;

			// document definition
			let g_document!: CompatibleDocument<OpenAPIV2.Document>;


			// config provides string for document
			if('string' === typeof gc_service.openApiDocument) {
				p_document = gc_service.openApiDocument;
			}
			// config provides full document
			else if('object' === typeof gc_service.openApiDocument) {
				g_document = gc_service.openApiDocument;
			}
			// no document specified in config nor cli
			else if('string' !== typeof g_argv.apiDocument) {
				throw new Error(`No document was specified in config, must provide one in CLI arg`);
			}


			// document struct was not defined, resolve path
			if(!g_document) {
				let s_document = '';

				// remote URL
				if(/^[a-z]+:\/\//.test(p_document)) {
					// attempt to fetch the remote document
					let d_res: Response;
					try {
						d_res = await fetch(p_document, {
							headers: {
								accept: 'application/json,application/yaml',
							},
							redirect: 'follow',
						});
					}
					catch(e_fetch) {
						throw new Error(`Failed to fetch remote API document from <${p_document}>: ${e_fetch.message}`);
					}

					// prep response text
					let s_response = '';

					// parse response data as text
					try {
						s_response = await d_res.text();
					}
					catch(e_text) {
						throw new Error(`Remote server returned unparseable binary data for <${p_document}>`);
					}

					// not an ok HTTP response status code
					if(!d_res.ok) {
						throw new Error(`Remote server returned non-200 response to document fetch request <${p_document}>: ${d_res.status} \n${s_response}`);
					}

					// set document source
					s_document = s_response;
				}
				// local file
				else {
					// attempt to read as UTF-8
					try {
						s_document = await Deno.readTextFileSync(p_document);
					}
					catch(e_read) {
						throw new Error(`Failed to read local API document file ${p_document} : ${e_read.message}`);
					}
				}

				// document is JSON
				if(/^\s*\{/.test(s_document)) {
					// attempt to parse
					try {
						g_document = JSON.parse(s_document);
					}
					catch(e_parse) {
						throw new Error(`Failed to parse document as JSON: ${e_parse.message}`);
					}
				}
				// document is YAML
				else {
					try {
						g_document = parseYaml(s_document);
					}
					catch(e_parse) {
						throw new Error(`Failed to parse document as YAML: ${e_parse.message}`);	
					}
				}
			}

			// validate shape
			if('object' !== typeof g_document.paths) {
				throw new Error(`The parsed document does not have the expected shape. Are you sure the file is properly formatted?`);
			}

			// re-assign the document struct
			gc_service.openApiDocument = g_document;

			// fire document loaded hook
			const g_augmentation = await gc_service.documentLoaded?.(g_document);

			// run the extraction
			await extract(gc_service, g_augmentation);
		})
	.strictCommands()
	.demandCommand(1)
	.parse();
