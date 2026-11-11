.PHONY: rodar testar build docker

rodar:
	SEED_EXEMPLOS=true go run ./cmd/server

testar:
	go vet ./... && go test -race ./...

build:
	CGO_ENABLED=1 go build -trimpath -o corretor ./cmd/server

docker:
	docker build -t corretor-textual .
