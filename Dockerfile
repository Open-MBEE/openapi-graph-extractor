FROM denoland/deno:alpine-1.29.2

ENV EXTRACT_FILE "/tmp/extract.ttl"

WORKDIR $DENO_DIR
USER deno

ADD . .
RUN deno cache cli.ts

ENTRYPOINT ["/bin/sh", "-c", "deno run --no-prompt --allow-env --allow-read --allow-net cli.ts extract examples/jama.ts examples/jama.json > $EXTRACT_FILE"]