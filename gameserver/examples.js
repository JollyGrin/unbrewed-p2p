// A card is flipped, this json is sent to server
var player_msg = {
  "msgtype": "playerstate",
  "content" : {
      "pool": {
      "deck": 30,
      "hand": 6,
      "discard": {},
      "commit": {
        "main": {},
        "boost": 5,
      },
    }
  }
}

var eg1 = {"msgtype":"playerstate", "content":"woo!"}

// This is the response from the server
var server_msg = {
  "msgtype": "gamestate",
  "players" : {
    "steven": {"playerstate":{}},
    "dean": {"playerstate":{}}
  }
}
