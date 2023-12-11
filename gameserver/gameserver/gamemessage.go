package gameserver

import (
	"encoding/json"
)

const (
	MsgTypePlayerPosition = "playerposition"
	MsgTypePlayerState    = "playerstate"
	MsgTypeGameState      = "gamestate"
	MsgTypePing           = "ping"
	MsgTypePong           = "pong"
)

type GameMessage struct {
	MessageType string          `json:"msgtype"`
	Content     json.RawMessage `json:"content"`
	Error       string          `json:"error,omitempty"`
}
