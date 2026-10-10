package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Emyrk/unbrewed-server/gameserver"
	"github.com/Emyrk/unbrewed-server/telemetry"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	reg := prometheus.NewRegistry()
	gs := gameserver.NewGameServer(reg)
	ctx, cancel := context.WithCancel(context.Background())

	emitter, err := telemetry.FromEnv()
	if err != nil {
		log.Printf("sandbox telemetry: %v", err)
	}
	gs.Telemetry = emitter
	// Only with telemetry on: off, the relay keeps its default SIGTERM handling.
	if emitter.Enabled() {
		go shutdownOnSIGTERM(gs)
	}

	launchPrometheus(ctx, ":9999", reg)

	defer cancel()
	fmt.Println(gs.Serve(ctx))
}

// shutdownOnSIGTERM reports open rooms as closed and flushes telemetry
// (capped at 3s) before exiting.
func shutdownOnSIGTERM(gs *gameserver.GameServer) {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM)
	<-sig
	log.Printf("SIGTERM: flushing sandbox telemetry")
	gs.EmitShutdown()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := gs.Telemetry.Close(ctx); err != nil {
		log.Printf("sandbox telemetry final flush: %v", err)
	}
	os.Exit(0)
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
