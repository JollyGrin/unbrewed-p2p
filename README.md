<div align="center">

# 🐰 Unbrewed

**Play your favorite [Unmatched](https://unmatched.cards) fan decks online with friends — all you need is a browser.**

[**▶ Play now at unbrewed.xyz**](https://unbrewed.xyz)

[![Website](https://img.shields.io/badge/play-unbrewed.xyz-4b2a52?style=flat-square)](https://unbrewed.xyz)
[![Discord](https://img.shields.io/badge/chat-discord-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/qPxHFjwkNN)
[![YouTube](https://img.shields.io/badge/guides-youtube-FF0000?style=flat-square&logo=youtube&logoColor=white)](https://youtube.com/playlist?list=PLjsjwAfJTj3a2NMDzOENFMwOYUzsFQn_C&si=Wi-MwpmS6loyBpB3)
[![Next.js](https://img.shields.io/badge/next.js-13-black?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![Go](https://img.shields.io/badge/gameserver-go-00ADD8?style=flat-square&logo=go&logoColor=white)](gameserver/)

<img src="docs/media/game-hand.jpg" alt="A live Unbrewed game: John Wick vs King Kong on Sinbad's Port — hovering a card lifts it out of your hand fan" width="850" />

*John Wick vs King Kong, live over websocket. Hover a card to read it, drag tokens around any map.*

</div>

---

## ✨ What is Unbrewed?

[Unmatched](https://boardgamegeek.com/boardgame/274637/unmatched-game-system) has a thriving homebrew community designing custom decks on [unmatched.cards](https://unmatched.cards) — but playtesting them used to mean printing cards or wrestling with Tabletop Simulator. **Unbrewed is a free, open-source virtual tabletop built just for that:**

- 🎴 **Bring any deck** — import from unmatched.cards with one code, paste raw JSON, or load from card image URLs
- 🗺️ **Play on any map** — drop in any image URL and it syncs to everyone at the table
- 🌐 **No accounts, no installs** — share a lobby name with a friend and you're dueling
- ♻️ **Evergreen by design** — decks & maps live in your browser's localStorage, the client is a static site, and anyone can host the tiny Go gameserver

> Unbrewed is a fan-made hobby project and is not owned by or associated with Restoration Games, LLC.

## 📸 Tour

| Load up your bag | Connect in three steps |
| :---: | :---: |
| <img src="docs/media/bag.jpg" alt="The bag: manage decks and maps" /> | <img src="docs/media/connect.jpg" alt="Connect to a lobby in three steps" /> |
| **The Bag** — collect decks & maps, star your favorites | **Connect** — pick a deck, name a lobby, share it with a friend |

<div align="center">
  <img src="docs/media/game-table.jpg" alt="The virtual table: shared map, draggable tokens, hands and life totals" width="850" />
  <p><em>The table — shared map, color-codable tokens, life/hand/deck counters for every player.</em></p>
</div>

## 🚀 Play online (easiest)

1. Find or build a deck on [unmatched.cards](https://unmatched.cards) or any TTS deck maker like [the-unmatched.club](https://www.the-unmatched.club/c/heroes)
2. Add it to your bag at [unbrewed.xyz/bag](https://unbrewed.xyz/bag)
3. Create a lobby on [unbrewed.xyz/connect](https://unbrewed.xyz/connect)
4. Send the lobby name to a friend — that's it 🎉

A default gameserver is already live, so most players never need to run anything.

## 🛠️ Run locally

```bash
# 1. build the Go gameserver
cd gameserver && go build && cd ..

# 2. start the gameserver (ws relay on :1111)
yarn server

# 3. in another terminal, start the web app
yarn install
yarn dev
```

Open http://localhost:3000, then point the app at your local server on the settings page (`http://localhost:1111`).

## 🌍 Host a gameserver for friends

You can run the server on your own machine — free, and independent of Unbrewed's servers ever going offline:

1. `cd gameserver && go build`
2. `cd ../ && yarn server` — relay now running on `localhost:1111`
3. Sign up for a free [ngrok](https://ngrok.com) account
4. In a new terminal: `yarn grok` and copy the public URL it prints
5. Paste that URL at [unbrewed.xyz/settings](https://unbrewed.xyz/settings) — and share it with your friends so they connect to the same server

Want to run a 24/7 public server for the community? Open an issue or PR so we can add it to the default server list. (`fly.toml` and `Dockerfile.gameserver` are included if you like [Fly.io](https://fly.io) or containers.)

## 🏗️ How it works

```mermaid
flowchart LR
    subgraph "Player A's browser"
        A["Next.js static app<br/>decks & maps in localStorage"]
    end
    subgraph "Player B's browser"
        B["Next.js static app<br/>decks & maps in localStorage"]
    end
    S["Go gameserver<br/>(tiny websocket relay,<br/>rooms in memory)"]
    A <-- "playerstate / playerposition" --> S
    S <-- "playerstate / playerposition" --> B
```

The server holds no game logic and no database — it just relays each player's state to everyone in the room. All deck data stays in the browser, and the client exports as a fully static site (it runs on GitHub Pages). If unmatched.cards or the default server ever disappear, any static host + one Go binary keeps the game alive.

## 🍴 Fork it & deploy on GitHub Pages

Unbrewed uses Next.js static export, so your fork can run on GitHub Pages. Since Pages serves from `https://username.github.io/repo/`, update the repo name in the build steps:

- [`lib/buildTools/prefixFonts.js`](lib/buildTools/prefixFonts.js) — replace `unbrewed-p2p` with your fork's repo name
- [`next.config.js`](next.config.js) — use `NODE_ENV` to set the production `basePath` to your repo name

## 🤝 Contributing

PRs, forks, and feature requests through the [issue tracker](https://github.com/JollyGrin/unbrewed-p2p/issues) are all welcome! Come say hi on [Discord](https://discord.gg/qPxHFjwkNN).

- 📓 Curious how the project evolved? Read the [dev journal](docs/JOURNAL.md)
- 🧪 Run tests with `yarn test`

<details>
<summary><strong>How to add fonts</strong></summary>

1. Add the file to `public/fonts`
2. Update `styles/fonts.css`
3. Update `styles/styles.ts`
4. Update `lib/buildTools/prefixFonts.js` to add another HTML match for fixing production links (GitHub Pages puts the repo name in the URL)

</details>

## 🙏 Credits

- [JonG](https://github.com/JonathanGuberman) — creator of [unmatched.cards](https://unmatched.cards) (build your own Unmatched deck) and the [card template styling](https://github.com/JonathanGuberman/unmatched_maker/blob/a7e96b69559461bfac7d3203d8d3899d4af36398/src/components/UnmatchedCard.vue) Unbrewed's card renderer is based on
- The Unmatched homebrew community for the decks and maps that make this fun ❤️
