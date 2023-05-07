package main

import (
	"fmt"

	"github.com/Emyrk/unbrewed-server/gameserver"
)

func main() {
	gs := gameserver.NewGameServer()
	fmt.Println(gs.Serve())
}
