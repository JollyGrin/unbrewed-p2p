package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"

	"github.com/Emyrk/unbrewed-server/gameserver"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	reg := prometheus.NewRegistry()
	gs := gameserver.NewGameServer(reg)
	ctx, cancel := context.WithCancel(context.Background())

	launchPrometheus(ctx, ":9999", reg)

	defer cancel()
	fmt.Println(gs.Serve(ctx))
}

func launchPrometheus(ctx context.Context, address string, registry *prometheus.Registry) {
	registry.MustRegister(collectors.NewGoCollector())
	srv := http.Server{
		Addr:    address,
		Handler: promhttp.HandlerFor(registry, promhttp.HandlerOpts{}),
		BaseContext: func(listener net.Listener) context.Context {
			return ctx
		},
	}
	go func() {
		log.Printf("Starting prometheus server on %s", address)
		err := srv.ListenAndServe()
		if err != nil {
			log.Printf("prometheus server error: %v", err)
		}
	}()
}
