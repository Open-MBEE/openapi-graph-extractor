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

const A_PRIMITIVES = ['ID', ...Object.keys(H_GRAPHQL_TYPES_TO_XSD)];

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

		// any merger
		const h_anys: Dict<Set<string>> = {};

		// links
		const h_links: Dict<Dict<string[]>> = {};

		// classes
		const h_classes: Dict<string[]> = {};

		// unionizer
		function unionize(a_things: string[], si_pre: string, si_post: string='') {
			// target default thing
			let si_target = a_things[0];

			// multiple things
			if(a_things.length > 1) {
				// TODO: consider if the de-arrayed objects should remain
				// remove arrays
				a_things = a_things.map(s => s.replace(/^\[+(.*)\]+$/, '$1')).filter(s => s);

				// cannot mix primitives and non-primitives
				if(!a_things.every(s => A_PRIMITIVES.includes(s))) {
					a_things = a_things.filter(s => !A_PRIMITIVES.includes(s));
				}

				// still multiple things
				if(a_things.length > 1) {

					// create union target
					si_target = `${si_pre}${si_post}`;

					// add definition to schema
					s_schema += `union ${si_target} = ${a_things.join(' | ')}\n\n`;
				}
			}

			// return target
			return si_target;
		}

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

			// unions
			const as_unions = new Set<string>();

			// properties
			for(const [si_field, s_field_type] of ode(g_type.fields)) {
				// resolve type
				let s_out_type = gc_graphql?.field?.(si_field, s_field_type, si_type) || s_field_type;

				// add to definition
				a_lines.push(`${si_field}: ${s_out_type}`);

				// merge type with any
				(h_anys[si_field] ??= new Set()).add(s_field_type);

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

					// derived object type
					if(s_field_type in this._h_objects) {
						as_unions.add(s_field_type);
					}
				}
			}

			// links
			for(const [si_field, si_key] of ode(g_type.links)) {
				if(si_key) {
					// resolve target
					const si_class = h_keys[si_key] || presume_key(si_key);
					
					// add property to class
					a_lines.push(`${si_field}: ${si_class}`);

					// record inverse link
					((h_links[si_class] ??= {})[si_field] ??= []).push(si_type);

					// merge type with any
					(h_anys[si_field] ??= new Set()).add(si_class);

					// add target to union type
					as_unions.add(si_class);

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

			// add special `_any` field
			if(as_unions.size) {
				a_lines.push(`_any: ${unionize([...as_unions], si_type, '_any')}`);
			}

			// save class
			h_classes[si_type] = a_lines;

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
			const a_lines = oderac(h_object, (si_key, s_type) => `${si_key}: ${s_type}`);

			// TODO: add inverse links to owner

			s_schema += group(`type ${si_object}`, a_lines);

			// // add to context
			// h_context[si_object] = {
			// 	'@type': '@id',
			// 	'@id': p_base+'/definitions/'+si_object,
			// };
		}

		// each class
		for(const [si_class, a_lines] of ode(h_classes)) {
			// each incoming link for this class
			for(const [si_link, a_origins] of ode(h_links[si_class] || {})) {
				// define inverse property
				const si_prop = `_inv_${si_link}`;

				// add inverse property
				a_lines.push(`${si_prop}: ${unionize(a_origins, si_class, si_prop)}`);
			}

			// object type def
			s_schema += group(`type ${si_class} @object`, a_lines);
		}

		// create Any class
		{
			const a_lines: string[] = [];

			// each any property
			for(const [si_prop, as_types] of ode(h_anys)) {
				const si_target = unionize([...as_types], '_Any_', si_prop);

				// add property
				a_lines.push(`${si_prop}: ${si_target}`);
			}

			a_lines.push(`_any: ${unionize(Object.keys(_h_types), '_Any', '_any')}`);

			// define Any type
			s_schema += group(`type _Any`, a_lines);
		}


		// prepend root query types
		s_schema = [
			'directive @object on OBJECT',
			'directive @any on FIELD_DEFINITION',
			'directive @unique on FIELD_DEFINITION',
			// 'directive @inverse on FIELD',
			'directive @many on FIELD',
			`directive @filter(
				is: String,
				not: String,
				in: [String],
				notIn: [String],
				contains: String,
				notContains: String,
				startsWith: String,
				notStartsWith: String,
				endsWith: String,
				notEndsWith: String,
				regex: String,
				notRegex: String,
				equals: Float,
				notEquals: Float,
				lessThan: Float,
				notLessThan: Float,
				greaterThan: Float,
				notGreaterThan: Float,
				lessThanOrEqualTo: Float,
				notLessThanOrEqualTo: Float,
				greaterThanOrEqualTo: Float,
				notGreaterThanOrEqualTo: Float,
			) on FIELD`.replace(/\n\s+/g, '\n  ').replace(/\n\s+([^\n]+)$/, '\n$1'),
			'\n',
		].join('\n')
			+group('type Query', a_queries)
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
