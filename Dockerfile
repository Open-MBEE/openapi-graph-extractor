FROM denoland/deno:alpine-1.29.2

WORKDIR $DENO_DIR
USER deno

ADD . .
RUN deno cache cli.ts

ENTRYPOINT ["/tini", "--", "docker-entrypoint.sh", "run", "--no-prompt", "--allow-env", "--allow-read", "--allow-net", "cli.ts"]