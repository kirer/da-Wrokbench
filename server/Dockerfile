FROM rust:slim-bookworm AS build

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --user-group --home-dir /data workbench \
    && mkdir -p /data \
    && chown workbench:workbench /data

COPY --from=build /app/target/release/dsh-workbench-server /usr/local/bin/dsh-workbench-server

USER workbench
WORKDIR /data
ENV DATABASE_PATH=/data/workbench.db
ENV PORT=3210
EXPOSE 3210
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["dsh-workbench-server"]
