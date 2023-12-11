package main

import (
	"context"
	"fmt"

	"github.com/Emyrk/unbrewed-server/gameserver"
)

func main() {
	gs := gameserver.NewGameServer()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	fmt.Println(gs.Serve(ctx))
}
