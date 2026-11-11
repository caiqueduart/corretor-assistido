# Compilação (o driver SQLite usa cgo).
FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/corretor ./cmd/server \
 && mkdir -p /out/dados

# Imagem final mínima, sem shell, rodando como usuário sem privilégios.
FROM gcr.io/distroless/base-debian12:nonroot
COPY --from=build /out/corretor /corretor
COPY --from=build --chown=65532:65532 /out/dados /dados
ENV ADDR=:8080 \
    DB_PATH=/dados/corretor.db
VOLUME /dados
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/corretor"]
