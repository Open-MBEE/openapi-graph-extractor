/**
 * Shortcut for a very common type pattern
 */
export type Dict<w_value=string> = Record<string, w_value>;

/**
 * Shortcut for another common type pattern
 */
export type Arrayable<w_value> = w_value | Array<w_value>;

/**
 * Shortcut for another common type pattern
 */
export type Promisable<w_value> = w_value | Promise<w_value>;

/**
 * Root type for all objects considered to be parsed JSON objects
 */
export interface JsonObject<w_inject extends any=never> {  // eslint-disable-line
	[k: string]: JsonValue<w_inject>;
}

/**
 * Union of "valuable", primitive JSON value types
 */
export type JsonPrimitive =
	| boolean
	| number
	| string;

/**
 * All primitive JSON value types
 */
export type JsonPrimitiveNullable<w_inject extends any=never> =
	| JsonPrimitive
	| null
	| w_inject;

/**
 * JSON Array
 */
export type JsonArray<w_inject extends any=never> = JsonValue<w_inject>[];

/**
 * All JSON value types
 */
export type JsonValue<w_inject extends any=never> =
	| JsonPrimitiveNullable<w_inject>
	| JsonArray<w_inject>
	| JsonObject<w_inject>
	| Arrayable<undefined>;


/**
 * The frequently-used "no-operation" function
 */
export const F_NOOP = () => {};  // eslint-disable-line


/**
 * The seldomnly-used "identity" function
 */
export const F_IDENTITY =(w: any) => w;  // eslint-disable-line


/**
 * Creates a proper-case string
 */
export const proper = (s_input: string): string => s_input.split(/[\s_]+/g).map(s => s[0].toUpperCase()+s.slice(1)).join(' ');

/**
 * Simple test for whether a deserialized JSON value is a plain object (dict) or not
 */
export const is_dict = (z: unknown): z is JsonObject => z? 'object' === typeof z && !Array.isArray(z): false;

/**
 * More advanced test for whether an ES object is a plain object (dict) or not
 */
export const is_dict_es = (z: unknown): z is JsonObject => z? 'object' === typeof z && Object === z.constructor: false;


/**
 * Fold array into an object
 */
export function fold<w_out, w_value>(a_in: w_value[], f_fold: (z_value: w_value, i_each: number) => Dict<w_out>): Dict<w_out> {
	const h_out = {};
	let i_each = 0;
	for(const z_each of a_in) {
		Object.assign(h_out, f_fold(z_each, i_each++));
	}

	return h_out;
}


/**
 * Creates a new array by inserting an item in between every existing item
 */
export function interjoin<
	w_item extends any,
	w_insert extends any,
>(a_input: w_item[], w_insert: w_insert): Array<w_item | w_insert> {
	const a_output: Array<w_item | w_insert> = [];

	for(let i_each=0, nl_items=a_input.length; i_each<nl_items-1; i_each++) {
		a_output.push(a_input[i_each]);
		a_output.push(w_insert);
	}

	if(a_input.length) a_output.push(a_input.at(-1)!);

	return a_output;
}

/**
 * Removes duplicates from an array, keeping only the first occurrence.
 * @param z_identify - if specified and a string, identifies the key of each item to use as an identifier
 * if specified and a function, used as a callback to produce the comparison key
 * if omitted, compares items using full equality `===`
 */
export function deduplicate<
	z_item extends any,
	s_key extends keyof z_item=keyof z_item,
>(a_items: z_item[], z_identify?: s_key | ((z_item: z_item) => any)): typeof a_items {
	// compare items exactly by default
	let a_keys: any[] = a_items;

	// identify argument
	if(z_identify) {
		// use object property
		if('string' === typeof z_identify) {
			a_keys = a_items.map(w => w[z_identify]);
		}
		// use identity function
		else if('function' === typeof z_identify) {
			a_keys = a_items.map(z_identify);
		}
		else {
			throw new TypeError(`Invalid identifier argument value: ${String(z_identify)}`);
		}
	}

	// each item in list
	for(let i_item=0, nl_items=a_items.length; i_item<nl_items; i_item++) {
		const si_item = a_keys[i_item];

		// compare against all higher-indexed items
		for(let i_test=i_item+1; i_test<nl_items; i_test++) {
			// found duplicate
			if(si_item === a_keys[i_test]) {
				// remove duplicate
				a_items.splice(i_test, 1);
				a_keys.splice(i_test, 1);

				// update length
				nl_items -= 1;

				// update test index
				i_test -= 1;

				// repeat
				continue;
			}
		}
	}

	return a_items;
}

/**
 * Escape all special regex characters to turn a string into a verbatim match pattern
 * @param s_input input string
 * @returns escaped string ready for RegExp constructor
 */
export const escape_regex = (s_input: string): string => s_input.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');


/**
 * Typed alias to `Object.entries`
 */
export function ode<
	h_object extends Record<string, any>,
	as_keys extends Extract<keyof h_object, string>=Extract<keyof h_object, string>,
>(h_object: h_object): Array<[as_keys, h_object[as_keys]]> {
	return Object.entries(h_object) as Array<[as_keys, h_object[as_keys]]>;
}


/**
 * Typed alias to `Object.fromEntries`
 */
export function ofe<
	as_keys extends string=string,
	w_values extends any=any,
>(a_entries: Array<[as_keys, w_values]>): Record<as_keys, w_values> {
	return Object.fromEntries(a_entries) as Record<as_keys, w_values>;
}


/**
 * Helper type for defining the expected type for `[].reduce` alias
 */
type ReduceParameters<
	w_value extends any=any,
> = Parameters<Array<w_value>['reduce']>;


/**
 * Reduce object entries to an arbitrary type
 */
export function oder<
	w_out extends any,
	w_value extends any,
>(h_thing: Dict<w_value>, f_reduce: ReduceParameters[0], w_init: w_out): w_out {
	return ode(h_thing).reduce(f_reduce, w_init) as w_out;
}


/**
 * Reduce object entries to an array via concatenation
 */
export function oderac<
	w_out extends any,
	w_value extends any,
>(h_thing: Dict<w_value>, f_concat: (si_key: string, w_value: w_value, i_entry: number) => w_out, b_add_undefs=false): w_out[] {
	return ode(h_thing).reduce<w_out[]>((a_out, [si_key, w_value], i_entry) => {
		const w_add = f_concat(si_key, w_value, i_entry);
		if('undefined' !== typeof w_add || b_add_undefs) {
			a_out.push(w_add);
		}

		return a_out;
	}, []);
}


/**
 * Reduce object entries to an array via flattening
 */
export function oderaf<
	w_out extends any,
	w_value extends any,
>(h_thing: Dict<w_value>, f_concat: (si_key: string, w_value: w_value, i_entry: number) => w_out[]): w_out[] {
	return ode(h_thing).reduce((a_out, [si_key, w_value], i_entry) => [
		...a_out,
		...f_concat(si_key, w_value, i_entry),
	], [] as w_out[]);
}


/**
 * Reduce object entries to an object via merging
 */
export function oderom<
	w_out extends any,
	h_thing extends Record<string | symbol, any>,
	as_keys_in extends keyof h_thing,
	w_value_in extends h_thing[as_keys_in],
	as_keys_out extends string | symbol,
>(h_thing: h_thing, f_merge: (si_key: as_keys_in, w_value: w_value_in) => Record<as_keys_out, w_out>): Record<as_keys_out, w_out> {
	return ode(h_thing).reduce((h_out, [si_key, w_value]) => ({
		...h_out,
		...f_merge(si_key as string as as_keys_in, w_value),
	}), {}) as Record<as_keys_out, w_out>;
}


/**
 * Reduce object entries to an object via transforming value function
 */
export function fodemtv<
	w_out extends any,
	w_value extends any,
>(h_thing: Dict<w_value>, f_transform: (w_value: w_value, si_key?: string) => w_out): Dict<w_out> {
	return Object.fromEntries(
		ode(h_thing).map(([si_key, w_value]) => [si_key, f_transform(w_value, si_key)])
	);
}


/**
 * Promise-based version of `setTimeout()`
 */
export function timeout(xt_wait: number): Promise<void> {
	return new Promise((fk_resolve) => {
		setTimeout(() => {
			fk_resolve();
		}, xt_wait);
	});
}


/**
 * Promse-based version of `queueMicrotask()`
 */
export function microtask(): Promise<void> {
	return new Promise((fk_resolve) => {
		queueMicrotask(() => {
			fk_resolve();
		});
	});
}


/**
 * Generate a random int within a given range
 */
export function random_int(x_a: number, x_b=0): number {
	const x_min = Math.floor(Math.min(x_a, x_b));
	const x_max = Math.ceil(Math.max(x_a, x_b));

	// confine to range
	return Math.floor(Math.random() * (x_max - x_min)) + x_min;
}

type TypedArray =
	| Int8Array
	| Uint8Array
	| Uint8ClampedArray
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array;

/**
 * Shuffles an array
 */
export function shuffle<
	w_list extends Array<any> | TypedArray,
>(a_items: w_list, f_random=random_int): w_list {
	let i_item = a_items.length;

	while(i_item > 0) {
		const i_swap = f_random(--i_item);
		const w_item = a_items[i_item];
		a_items[i_item] = a_items[i_swap];
		a_items[i_swap] = w_item;
	}

	return a_items;
}

/**
 * Removes the first occurrence of the given item from the array
 * @param a_items 
 * @param w_item 
 * @returns 
 */
export function remove<w_item>(a_items: w_item[], w_item: w_item): w_item[] {
	const i_item = a_items.indexOf(w_item);
	if(i_item >= 0) a_items.splice(i_item, 1);
	return a_items;
}

export function combinations(...a_arrays: any[][]) {
	const a_combos: any[][] = [];
 
	function combos(i_array: number, a_combo: any[]) {
	  if(i_array === a_arrays.length) {
			a_combos.push(a_combo);
			return;
	  }
 
	  const a_current = a_arrays[i_array];
	  for(const a_value of a_current) {
			combos(i_array+1, a_combo.concat(a_value));
	  }
	}
 
	combos(0, []);
 
	return a_combos;
 }
