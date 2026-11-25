# syntax=docker/dockerfile:1
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Pure-Go build (no CGO): a static binary that starts in milliseconds
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/dmm-server ./cmd/dmm-server
# The data directory must be writable by the non-root user (distroless has no shell to create it)
RUN mkdir /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/dmm-server /dmm-server
COPY --from=build --chown=65532:65532 /out/data /data
USER nonroot:nonroot
ENV DMM_ADDR=:8080 DMM_DB_URL=sqlite:/data/dmm.db
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/dmm-server"]
