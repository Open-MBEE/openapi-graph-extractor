# OpenAPI Graph Extractor

> Extracts and converts JSON data to RDF using an OpenAPI document and the JSON Schema embedded within it

This tool facilitates the semantic lifting of (optionally linked) structured data from a web service described by an OpenAPI document. In addition to capturing object structure and rich data type information (such as integer, date-time, etc.), the crux of the tool is in its ability to create linked data from services that use [Linked Description Objects](https://json-schema.org/draft/2019-09/json-schema-hypermedia.html#ldo) as defined by the [JSON Hyper-Schema](https://json-schema.org/draft/2019-09/json-schema-hypermedia.html).

Setting up a new extraction target involves providing the OpenAPI document as a URL or a file and a configuration script, which provides arguments and hooks to be used during the extraction process. See [examples](/examples/) .


## Features

 - Maps JSON Schema data types to XSD data types in RDF (e.g., `date-time` becomes `xsd:dateTime`)
 - As a fallback, capable of mapping JSON primitive data types to XSD data types when not defined by schema (e.g., `number` can be configured to translate into `xsd:integer` or `xsd:decimal` depending on the value)
 - Sweeps all GET methods that are available, providing path/query args supplied by config script
 - Iteratively crawls all links discovered during processing by matching them to a `paths` item in the OpenAPI document
 - Uses the `$ref` IDs when generating IRIs for the `rdf:type` object; creating human-readable class IRIs for all objects that are following best practices


## Usage

Start by installing the dependencies with integrity checks
```console
$ deno cache --reload --lock=deno.lock cli.ts
```

Now you can run the cli with restricted permissions
```console
$ deno run \
    --lock=deno.lock \
    --no-prompt \
    --allow-env=EG_USERNAME,EG_PASSWORD,EG_ARG1,EG_ARG2 \
    --allow-read=./path/to/config-script.ts \
    --allow-net=example.org \
    --allow-write=build \
    cli.ts \
        extract \
            /path/to/config-script.ts \
            https://example.org/open-api-doc.json \
   > build/output.ttl
```
