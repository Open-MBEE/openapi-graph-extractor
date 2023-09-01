import { Dict, ode, oderac } from './belt.ts';
import {graphql} from '../deps.ts';
import { ServiceConfigGlobal } from './exporter.ts';
import { P_NS_XSD } from './constants.ts';

export interface PreSchemaType {
	key: string;
	links: Dict;
	fields: Dict;
}

type ExpansionEnums = Dict<string[]>;
type ExpansionObjects = Dict<{}>;

export interface Expansions {
	enums: ExpansionEnums;
	objects: ExpansionObjects;
}

function group(sx_decl: string, a_statements: string[]) {
	return `${sx_decl} {${a_statements.map(s => `\n  ${s}`).join('')}\n}\n\n`;
}

function presume_key(si_key: string): string {
	return si_key[0].toUpperCase()+si_key.slice(1).replace(/s$/, '');
}

const H_GRAPHQL_TYPES_TO_XSD = {
	Boolean: 'boolean',
	Int: 'integer',
	Float: 'decimal',
	String: 'string',
};

export class GraphqlSchema {
	protected _h_types: Dict<PreSchemaType> = {};
	protected _h_enums: ExpansionEnums = {};
	protected _h_objects: ExpansionObjects = {};

	get types(): Dict<PreSchemaType> {
		return this._h_types;
	}

	addType(si_type: string, g_type:PreSchemaType ) {
		this._h_types[si_type] = g_type;
	}

	mergeExpansions(g_expansions: Expansions) {
		this._h_enums = Object.assign(this._h_enums, g_expansions.enums);
		this._h_objects = Object.assign(this._h_objects, g_expansions.objects);
	}

	dump(gc_graphql: ServiceConfigGlobal['graphql'] | undefined, p_base: string) {
		const {
			_h_types,			
		} = this;

		// generate key lookup
		const h_keys: Dict = {};
		for(const [si_type, g_type] of ode(_h_types)) {
			let si_key = g_type.key;

			if(!si_key) {
				si_key = si_type.toLowerCase()+'s';
			}

			h_keys[si_key] = si_type;
		}

		// prep root query types
		const a_queries: string[] = [];

		// prep json-ld context
		const h_context: Dict<string | {
			'@type': string;
			'@id': string;
		}> = {};

		// schema output
		let s_schema = '';

		// construct document ast
		for(const [si_type, g_type] of ode(_h_types)) {
			// skip null
			if(!si_type) {
				console.error(`Skipping empty type! `, g_type);
				continue;
			}

			// add root query type
			const si_camel = si_type[0].toLowerCase()+si_type.slice(1);
			a_queries.push(`${si_camel}: ${si_type}`);
			a_queries.push(`${si_camel}s: [${si_type}!]!`);

			// prep lines
			const a_lines: string[] = [];

			// properties
			for(const [si_field, s_field_type] of ode(g_type.fields)) {
				// resolve type
				let s_out_type = gc_graphql?.field?.(si_field, s_field_type, si_type) || s_field_type;

				// add to definition
				a_lines.push(`${si_field}: ${s_out_type}`);

				// check for conflict
				if('object' === typeof h_context[si_field]) {
					console.error(`Naming conflict on '${si_field}' prevents JSON-LD context mappign for GraphQL queries`);
				}

				// prep iri
				const p_iri = p_base+si_field;

				// xsd type
				if(s_field_type in H_GRAPHQL_TYPES_TO_XSD) {
					h_context[si_field] = {
						'@id': p_iri,
						'@type': P_NS_XSD+H_GRAPHQL_TYPES_TO_XSD[s_field_type as keyof typeof H_GRAPHQL_TYPES_TO_XSD],
					};
				}
				// add as plain property to json-ld context (leave as unknown type)
				else {
					h_context[si_field] = p_iri;
				}
			}

			// links
			for(const [si_field, si_key] of ode(g_type.links)) {
				if(si_key) {
					a_lines.push(`${si_field}: ${h_keys[si_key] || presume_key(si_key)}`);

					// check for conflict
					if('string' === typeof h_context[si_field]) {
						console.error(`Naming conflict on '${si_field}' prevents JSON-LD context mappign for GraphQL queries`);
					}

					// add link property to json-ld context
					h_context[si_field] = {
						'@type': '@id',
						'@id': p_base+si_field,
					};
				}
				else {
					console.warn(`undefined key in ${si_type} on field ${si_field}: ${si_key}`);
				}
			}

			// object type def
			s_schema += group(`type ${si_type} @object`, a_lines);

			// add to context
			h_context[si_type] = {
				'@type': '@id',
				'@id': p_base+'/definitions/'+si_type,
			};
		}

		// add enums
		for(const [si_enum, a_values] of ode(this._h_enums)) {
			// a_fields.push()

			s_schema += group(`enum ${si_enum}`, a_values);
		}

		// add objects
		for(const [si_object, h_object] of ode(this._h_objects)) {
			s_schema += group(`type ${si_object}`, oderac(h_object, (si_key, s_type) => `${si_key}: ${s_type}`));

			// // add to context
			// h_context[si_object] = {
			// 	'@type': '@id',
			// 	'@id': p_base+'/definitions/'+si_object,
			// };
		}

		// prepend root query types
		s_schema = [
			'directive @object on OBJECT',
			'directive @any on FIELD_DEFINITION',
			'directive @unique on FIELD_DEFINITION',
			'\n',
		].join('\n')
			+group('type Query', a_queries)
			+group('type Object', [])
			+s_schema;


		console.log(s_schema);

		Deno.writeFileSync('./build/schema.graphql', new TextEncoder().encode(s_schema));


		Deno.writeFileSync('./build/context.jsonld', new TextEncoder().encode(JSON.stringify({
			'@context': h_context,
		}, null, '  ')));

		// // finalize document
		// const g_doc: graphql.DocumentNode = {
		// 	kind: graphql.Kind.DOCUMENT,
		// 	definitions: a_defs,
		// };

		// const g_schema = graphql.buildASTSchema(g_doc);

		// console.log(graphql.printSchema(g_schema));
	}
}
