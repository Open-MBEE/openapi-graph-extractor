import { F } from 'npm:ts-toolbelt@9.6.0';
import {combinations, Dict, is_dict_es, JsonArray, JsonObject, JsonValue, ode, oderom} from './belt.ts';
import { Expansions, GraphqlSchema } from './graphql.ts';
import {JscAny, JscString, JscInterface, JscObject, LinkedDataWrapper, resolve, JscArray, $_REFERENCE_ID} from './json-schema.ts';

export interface LinkedDataSchemaDef {
	type: 'object';
	properties: {
		meta: JscObject<JscInterface>;
		links:  JscObject<never, {
			type: JscString;
			href: JscString;
		}>;
		linked: JscObject<never, JscObject<never, {}>>;
		data: JscArray<
			JscObject<JscInterface, never, string[]>
		> | JscObject<{}>;
	};
}

type SubstitutionPart = {
	si_type: 'string';
	s_value: string;
} | {
	si_type: 'data_path';
	a_values: string[];
};

type DataPathLink = {
	si_type: string;
	sr_path_key: string;
	p_href_raw: string;
	a_href_parts: SubstitutionPart[]
};


type C3 = Dict<Dict<JsonValue<void>>>;

const $_ADDTNL_PROPERTIES = Symbol('additional-properties');

const as_warnings = new Set<string>();
function warn(s_warn: string) {
	if(!as_warnings.has(s_warn)) {
		console.warn(s_warn);
		as_warnings.add(s_warn);
	}
}


export class Translation {
	protected _hc3_triples: C3 = {};

		// discovered resources
	protected _as_discovered = new Set<string>();

	protected _p_base: string;

	constructor(
		protected _p_root: string,
		protected _sr_path_template: string,
		protected _sr_path_actual: string,
		protected _g_schema: LinkedDataSchemaDef | JscArray<LinkedDataSchemaDef>,
		protected _g_body: LinkedDataWrapper,
		protected _ds_writer: {
			write(g_write: {type:string; value:object}): void;
		},
		protected _as_resources=new Set<string>(),
	) {
		this._p_base = this._p_root+this._sr_path_actual;
	}

	get resources(): Set<string> {
		return this._as_resources;
	}

	get discovered(): Set<string> {
		return this._as_discovered;
	}

	protected _remap_item(
		g_def: JscAny,
		z_value: JsonValue,
		p_self: string,
		si_key: string,
		b_not_actually_object=false
	): JsonValue<void> {
		const {_hc3_triples} = this;

		// property is not defined in schema
		if(!g_def?.type || b_not_actually_object) {
			warn(`Property was not defined in schema: ${si_key}`);

			// escape raw string literal
			if('string' === typeof z_value) {
				return '"'+z_value;
			}
			// supported primitve; let graphy determine appropriate datatype
			else if('boolean' === typeof z_value || 'number' === typeof z_value) {
				return z_value;
			}
			// array
			else if(Array.isArray(z_value)) {
				// preserve order
				return [z_value.map((z_item, i_item) => this._remap_item({} as JscAny, z_item, p_self+'/'+i_item, ''+i_item))];
			}
			// other
			else {
				// encode as JSON
				return '^oge:Json"'+JSON.stringify(z_value);
			}
		}
		else {
			const k_self = this;

			// depending on data type
			const f_which = ({
				boolean() {
					return `^xsd:boolean"${z_value}`;
				},

				integer() {
					return `^xsd:integer"${z_value}`;
				},

				string(_g_def: JscString<string>) {
					if('date-time' === _g_def.format) {
						return `^xsd:dateTime"${new Date(z_value as string).toISOString()}`;
					}
					else {
						return `^xsd:string"${z_value}`;
					}
				},

				array(_g_def: JscArray) {
					if(!Array.isArray(z_value)) {
						throw new Error(`Response data violates JSON schema at ${si_key}: expected array`);
					}

					// remap items
					const a_mapped = z_value.map((z_item, i_item) => k_self._remap_item(_g_def.items as JscAny, z_item, p_self+'/'+i_item, ''+i_item));
					
					// preserver order
					return [a_mapped];
				},

				object(_g_def: JscObject<{}, {}, string[]>) {
					const sc1_object = `>${p_self}/${si_key}`;

					// declare as object
					Object.assign(_hc3_triples[sc1_object] = _hc3_triples[sc1_object] || {}, {
						a: _g_def.additionalProperties? 'oge:Dictionary': 'oge:Object',
					});

					if(!is_dict_es(z_value)) {
						throw new Error(`Response data violates JSON schema at ${si_key}: expected object`);
					}

					const h_properties = (_g_def.properties || {}) as JscInterface;

					// add arbitrary keys to property def
					if(_g_def.additionalProperties) {
						h_properties[$_ADDTNL_PROPERTIES] = _g_def.additionalProperties;
					}

					k_self._remap(h_properties, z_value, `${p_self}/${si_key}`);

					return sc1_object;
				},
			})[g_def.type] as (_g_def: typeof g_def) => void;

			if(!f_which) {
				debugger;
				throw new Error(`Datatype mapping for ${g_def.type} not implemented`);
			}
			
			return f_which(g_def);
		}
	}

	protected _remap(h_properties: JscInterface, g_item: JsonObject, p_self: string) {
		const {_hc3_triples} = this;;

		const g_additionals = h_properties[$_ADDTNL_PROPERTIES];

		// upsert probs dict
		const hc2_probs: C3[string] = _hc3_triples[`>${p_self}`] = _hc3_triples[`>${p_self}`] || {};

		// each property in item
		for(const [si_key, z_value] of ode(g_item)) {
			// lookup schema def for this property or default to additional property
			const g_def = h_properties[si_key] || g_additionals;

			// not actually an object
			const b_not_actually_object = !h_properties[si_key] && 'object' === g_additionals?.type && !is_dict_es(z_value);

			// save to pairs
			hc2_probs[`:${si_key}`] = this._remap_item(g_def, z_value, p_self, si_key, b_not_actually_object);
		}
	}


	run(_k_graphql: GraphqlSchema) {
		const {
			_p_root,
			_p_base,
			_sr_path_template,
			_sr_path_actual,
			_g_schema,
			_g_body,
			_ds_writer,
			_as_resources,
			_hc3_triples,
			_as_discovered,
		} = this;

		// prep data path links
		const a_links: DataPathLink[] = [];

		// prep graphql expansions (enums and objects)
		const g_expansions: Expansions = {
			enums: {},
			objects: {},
		};

		// prep graphql shape
		let si_type_label = '';
		let h_links: Dict = {};
		let h_fields: Dict = {};

		let si_item_type = '';
		let b_exemplar = true;

		// each link descriptor response schema
		for(const [sr_path, g_link] of ode(_g_body.links || {})) {
			// parse schema path
			const a_path = sr_path.split('.');

			// data path
			if('data' === a_path[0]) {
				const p_href = g_link.href;

				// prep substitution parts
				const a_parts: SubstitutionPart[] = [];

				// index of previous raw literal part
				let i_index = 0;

				// match all substitutions in href template
				for(const m_match of p_href.matchAll(/\{([^\}]+)\}/g)) {
					// push raw range before match
					a_parts.push({
						si_type: 'string',
						s_value: p_href.slice(i_index, m_match.index),
					});

					// substution path
					const sr_match_path = m_match[1];

					// assert it is a data path
					if(!sr_match_path.startsWith('data.')) {
						throw new Error(`Found non-data path in link href: ${p_href}`);
					}

					// parse substitution path
					const a_substitution_path = sr_match_path.replace(/^data\./, '').split('.');

					// push to parts
					a_parts.push({
						si_type: 'data_path',
						a_values: a_substitution_path,
					});

					// update index
					i_index = m_match.index! + m_match[0].length;
				}

				// push final raw part of string
				a_parts.push({
					si_type: 'string',
					s_value: p_href.slice(i_index),
				});

				// save to data paths list
				a_links.push({
					si_type: g_link.type,
					sr_path_key: sr_path,
					p_href_raw: p_href,
					a_href_parts: a_parts,
				});
			}
		}

		// missing data
		if(!_g_body.data) {
			if('Unauthorized' === _g_body.meta.status) {
				console.error(`Not authorized to access ${_p_base}`);
				return;
			}
			else {
				debugger;
				throw new Error(`Missing data: ${JSON.stringify(_g_body)}`);
			}
		}

		// coerce to array
		const a_rows = Array.isArray(_g_body.data)? _g_body.data: [_g_body.data];

		// each data item
		for(const g_item of a_rows) {
			// TODO: use hook to allow user to define custom method for resolving IRI

			// build self iri
			let p_self = `${_p_base}/${g_item.id}`;

			// operation has path param; use actual path instead
			if(_sr_path_template.includes('{')) {
				p_self = `${_p_root}${_sr_path_actual}`;
			}

			// add to dataset
			_as_resources.add(p_self.slice(_p_root.length));

			// rdf:type IRI
			let p_type = _p_base;
			if('object' === _g_schema.type) {
				const g_schema_data = _g_schema.properties.data;

				let si_item_type: string | undefined;
				if('array' === g_schema_data.type) {
					si_item_type = g_schema_data.items[$_REFERENCE_ID];
				}
				else {
					si_item_type = g_schema_data[$_REFERENCE_ID];
				}

				if(si_item_type) {
					p_type = _p_root+si_item_type;

					const si_type_label_local = si_item_type.replace(/^.*\/([^/]+)$/, '$1');

					if(si_type_label && si_type_label_local !== si_type_label) {
						throw new Error(`Shape changed unexpectedly`);
					}

					si_type_label = si_type_label_local;


					const si_key = _sr_path_template.replace(/\/([^/]+).*$/, '$1');

					if(g_item.type !== si_key) {
						b_exemplar = false;
					}
				}
			}

			// prep output
			_hc3_triples[`>${p_self}`] = _hc3_triples[`>${p_self}`] || {
				a: '>'+p_type,
			};

			const as_removes = new Set<string>();

			// each link
			LINKS:
			for(const {sr_path_key, a_href_parts, p_href_raw, si_type} of a_links) {
				// queue removal from item
				as_removes.add(sr_path_key);

				// prep resource iri template
				let p_template = '';

				// prep deferred variable substitutions
				const a_variables: JsonArray[] = [[null]];

				// each part in href
				for(const g_href_part of a_href_parts) {
					// raw literal
					if('string' === g_href_part.si_type) {
						p_template += g_href_part.s_value;
					}
					// data path
					else if('data_path' === g_href_part.si_type) {
						const z_value = resolve(g_item, g_href_part.a_values);

						// undefined
						if('undefined' === typeof z_value) {
							// warn(`Item does not have a link to an expected target at: ${p_href_raw}`);

							// cannot produce link to undefined node
							continue LINKS;
						}
						// not a primitive type
						else if(!['boolean', 'number', 'string'].includes(typeof z_value)) {
							// array
							if(Array.isArray(z_value)) {
								p_template += `{${a_variables.length}}`;
								a_variables.push(z_value as JsonArray);
							}
							else {
								debugger;
								throw new Error(`Encountered non-primitive datatype in link path: ${p_href_raw}`);
							}
						}
						else {
							// concatenate to resource iri
							p_template += z_value;
						}
					}
				}

				// create combinations
				for(const a_combo of combinations(...a_variables)) {
					// prep actual resource iri
					let p_resource = p_template;

					// evaluate each replacement
					for(let i_var=1; i_var<a_combo.length; i_var++) {
						p_resource = p_resource.replace(`{${i_var}}`, a_combo[i_var]);
					}

					// add resource to discovered
					if(p_resource.startsWith(_p_root)) {
						_as_discovered.add(p_resource.slice(_p_root.length));
					}

					// produce link
					{
						// prep subject node
						let sv1_node = '>'+p_self;

						// each part in link path (skip leading "data.")
						const a_link_path = sr_path_key.split('.');
						for(let i_part=1, nl_parts=a_link_path.length; i_part<nl_parts; i_part++) {
							const s_part = a_link_path[i_part];

							// ensure subject exists
							const hc2_node = _hc3_triples[sv1_node] = _hc3_triples[sv1_node] || {};

							// prep object, default to terminal path part's target
							let sc1_object = '>'+p_resource;

							// non-terminal part requires intermediary, set object and mutate forwarding node
							if(i_part < nl_parts - 1) sc1_object = sv1_node += '/'+s_part;

							// add triple to set
							const w_existing = hc2_node[':'+s_part];
							(hc2_node[':'+s_part] = ((w_existing && !Array.isArray(w_existing))? [w_existing]: w_existing || []) as Array<any>).push(sc1_object);
						}

						// 1-degree links
						if(2 === a_link_path.length) {
							const s_part = a_link_path[1];

							// store association for graphql schema
							h_links[s_part] = si_type;
						}
					}
				}
			}

			// remove linked properties
			for(const sr_path of as_removes) {
				// resolve path on item to its parent
				const a_path_parts = sr_path.split('.');
				const g_parent = resolve(g_item, a_path_parts.slice(1, -1)) as JsonObject;

				// remove property from item
				try {
					delete g_parent?.[a_path_parts.at(-1)!];
				}
				catch(e_delete) {
					debugger;
				}
			}

			if('object' === _g_schema.type) {
				const g_schema_data = _g_schema.properties.data;

				if('array' === g_schema_data.type) {
					this._remap(g_schema_data.items.properties, g_item, p_self);
				}
				else {
					this._remap(g_schema_data.properties, g_item, p_self);
				}
			}
			else if('array' === _g_schema.type) {
				if('object' === _g_schema.items.type) {
					this._remap(_g_schema.items.properties, g_item, p_self);
				}
				else {
					throw new Error(`Unhandled array item type in response schema: ${_g_schema.items.type}`);
				}
			}
			else {
				throw new Error(`Unhandled type in response schema: ${_g_schema['type']}`);
			}
		}

		// dump triples
		_ds_writer.write({
			type: 'c3',
			value: _hc3_triples,
		});


		// add graphql types
		if('object' === _g_schema.type) {
			const g_schema_data = _g_schema.properties.data;

			let h_properties!: JscInterface;

			if('array' === g_schema_data.type) {
				h_properties = g_schema_data.items.properties;
			}
			else if('object' === g_schema_data.type) {
				h_properties = g_schema_data.properties;
			}

			if(h_properties) {
				// each property in schema
				for(const [si_field, g_field] of ode(h_properties)) {
					// links supercede schema properties
					if(!(si_field in h_links)) {
						h_fields[si_field] = schema_to_graphql(si_type_label, si_field, g_field, g_expansions);
					}
				}
			}
		}
		else if('array' === _g_schema.type) {
			if('object' === _g_schema.items.type) {
				debugger;
			}
		}

		const si_key = _sr_path_template.replace(/\/([^/]+).*$/, '$1');
		// if(si_type_label === 'ItemType') {
		// 	debugger;
		// }

		// if(!b_exemplar) {
		// 	debugger;
		// }

		// 
		if(!(si_type_label in _k_graphql.types) || b_exemplar) {
			// save graphql def to pre-schema 
			_k_graphql.addType(si_type_label, {
				key: si_key,
				links: h_links,
				fields: h_fields,
			});
		}


		// merge graphql expansions
		_k_graphql.mergeExpansions(g_expansions);
	}
}

function schema_to_graphql(si_type: string, si_field: string, g_field: JscAny, g_expansions: Expansions, a_blocking: JscAny[]=[g_field]): string {
	switch(g_field.type) {
		// boolean type
		case 'boolean': return 'Boolean';

		// integer type
		case 'integer': return 'Int';

		// string type
		case 'string': {
			// actually an enum
			if('enum' in g_field) {
				// normalize enum name
				const si_enum = `${si_type}_${si_field[0].toUpperCase()+si_field.slice(1)}`;

				// save enum schema
				g_expansions.enums[si_enum] = g_field.enum as string[];

				// save field type
				return si_enum;
			}

			// just a string
			return 'String';
		}

		// array type
		case 'array': return `[${schema_to_graphql(si_type, si_field, g_field.items as JscAny, g_expansions, a_blocking)}]`;

		// object type
		case 'object': {
			// requires an object extension type
			const si_object = `${si_type}_${si_field[0].toUpperCase()+si_field.slice(1)}`;

			// if(a_subblocking.length > 2) debugger;

			// console.log(si_type+' > '+si_field);

			// if('_FilterQuery_Rule_Rules_Rules' === si_type) {
			// 	debugger;
			// }

			const h_properties = (g_field as JscObject<{}>).properties || (g_field as JscObject<{}, {}>).additionalProperties.properties;

			if(!h_properties) {
				return 'Object @any';
			}

			// save object schema
			g_expansions.objects[si_object] = oderom(h_properties, (si_key, g_subfield) => {
				if(a_blocking.includes(g_subfield)) {
					return {};
				}

				// const w_ref = g_subfield[$_REFERENCE_ID];
				// if(w_ref && a_blocking.find(g => w_ref === (g as any)[$_REFERENCE_ID])) {
				// 	debugger;
				// }

				return {
					[si_key]: schema_to_graphql(si_object, si_key, g_subfield, g_expansions, [...a_blocking, g_subfield]),
				};
			});

			// save field type
			return si_object;
		}

		// unknown
		default: return '';
	}
}
