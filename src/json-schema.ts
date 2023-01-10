import {A} from 'npm:ts-toolbelt';
import { Arrayable, Dict, is_dict_es, JsonObject, JsonValue, ode } from './belt.ts';

import type {O} from 'npm:ts-toolbelt';


type NeverUnknown<
	w_thing extends any|never|unknown,
	si_key extends string,
	w_expect,
> = [w_thing] extends [never]
	? {}
	: [unknown] extends [w_thing]
		? Partial<Record<si_key, w_expect>>
		: Record<si_key, w_thing>;


type JscType = 'boolean' | 'integer' | 'string' | 'array' | 'object';

type JscBase<
	si_type extends JscType=JscType,
	g_merge extends object=object,
> = O.Merge<g_merge, {
	type: si_type;
}>;

export type JscBoolean = JscBase<'boolean', {}>;

export type JscInteger<
	s_format extends 'int32'='int32',
> = JscBase<'integer', {
	format: s_format;
}>;

export type JscString<
	s_format extends string|unknown|never=never,
> = JscBase<'string', NeverUnknown<s_format, 'format', string>>;


export type JscArray<
	w_items extends JscBase=JscBase,
> = JscBase<'array', {
	items: w_items;
}>;

export type JscObject<
	g_properties extends object|never|unknown=never,
	g_additionals extends object|never|unknown=never,
	a_required extends string[]|never|unknown=never
> = JscBase<'object', O.MergeAll<{}, [
   NeverUnknown<g_properties, 'properties', object>,
	[g_additionals] extends [never]? {}: {
		additionalProperties: JscObject<g_additionals>;
	},
   NeverUnknown<a_required, 'required', string[]>
]>>;

export type JscAny = JscBoolean | JscInteger | JscString | JscArray | JscObject


export type JscInterface = Record<string | symbol, JscAny>;

export interface LinkedDataWrapper<
   w_data extends Arrayable<JsonObject>=Arrayable<JsonObject>,
> {
	meta: {
		status: string;
		timestamp: string;
		pageInfo: {
			startIndex: number;
			resultCount: number;
			totalResults: number;
		};
	};
	links?: Record<`data.${string}`, {
		type: string;
		href: string;
	}>;
	linked?: Record<string, Record<string, object>>;
	data: w_data;
}

interface ReferenceObject {
   $ref: string;
}

export namespace Dereference {
	// removes $ref from all values of an object
	type DerefStruct<
		g_struct extends object,
	> = {
		[si_key in keyof g_struct]: DerefValue<g_struct[si_key]>;
	};

	// removes `ReferenceObject` (and `$ref` keys for good measure) from an object, and recurses
	type DerefUnion<
		g_struct extends object,
	> = DerefStruct<
		NonNullable<Omit<
			Exclude<g_struct, ReferenceObject>,
			'$ref'
		>>
	>;

	// recursively removes `$ref` keys from all objects contained in the given type
	type DerefValue<
		z_value,
	> = z_value extends Array<infer z_item>
		? DerefValue<z_item>[]
		: z_value extends {$ref?: any}
			? DerefUnion<z_value>
			: z_value extends object
				? DerefStruct<z_value>
				: z_value;

	// the exported type method
	export type Deeply<
		w_value,
	> = A.Compute<DerefValue<w_value>>;
}


/**
 * Resolves all $ref objects in a JSON Schema struct
 * @param h_json - the schema struct
 * @param h_blocking - dict of definitions that have started dereferencing
 * @returns the resolved struct
 */
export function deref(h_json: JsonObject, g_root: JsonObject, h_blocking: Dict<JsonObject>={}) {
	if('string' === typeof h_json['$ref']) {
		const p_path = h_json.$ref;

		if(p_path in h_blocking) {
			return h_blocking[p_path];
		}

		const a_parts = p_path.split('/');
		const s_root = a_parts.shift();
		let g_node = '#' === s_root? g_root: '.' === s_root? h_json: null;
		for(const s_part of a_parts) {
			g_node = (g_node?.[s_part] || null) as JsonObject;
		}

		const g_blocked = h_blocking[p_path] = {...g_node};

		return h_blocking[p_path] = deref_object(g_node!, h_blocking, g_blocked);
	}
	else {
		return deref_object(h_json, h_blocking);
	}
}

/**
 * Resolves all $ref objects in a JSON Schema struct
 * @param h_json - the schema struct
 * @param h_blocking - dict of definitions that have started dereferencing
 * @returns the resolved item
 */
function deref_object(h_json: JsonObject, g_root: JsonObject, h_blocking={}, h_dereffed={...h_json}) {
	for(const [si_key, w_value] of ode(h_json)) {
		if(is_dict_es(w_value)) {
			h_dereffed[si_key] = deref(w_value, g_root, h_blocking);
		}
	}

	return h_dereffed;
}

/**
 * Resolves a dot-notation path string to an item within a JSON object
 * @param g_item 
 * @param z_path 
 * @returns 
 */
export function resolve(g_item: JsonObject, z_path: string | string[]): JsonValue<undefined> {
	let a_path = z_path;

	if('string' === typeof z_path) {
		a_path = z_path.split('.');
	}

	let w_node = g_item;

	// resolve path on item
	for(const s_path_part of a_path) {
		w_node = w_node?.[s_path_part] as JsonObject;
	}

	return w_node;
}
