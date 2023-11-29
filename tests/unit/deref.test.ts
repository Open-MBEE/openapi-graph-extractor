import { assertEquals } from "https://deno.land/std@0.205.0/assert/mod.ts";
import { deref } from "../../src/json-schema.ts"

Deno.test('deref should resolve $ref objects', () => {

  const schema = {
    $ref: "#/definitions/TestSchema",
  };

  const root = {
    definitions: {
      TestSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          date: { type: "date" },
        },
      }
    }
  };

  const resolvedSchema = deref(schema, root);
  const expectedSchema = root['definitions']['TestSchema'];

  assertEquals(JSON.stringify(expectedSchema), JSON.stringify(resolvedSchema));
});
