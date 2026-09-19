# Peario

[Peario](https://peario.xyz) lets you watch Stremio streams in sync with friends: a Vue client and a small WebSocket relay server that links viewers together into shared rooms.

This repo consolidates both halves of the app - originally [tymmesyde/peario-client](https://github.com/tymmesyde/peario-client) and [tymmesyde/peario-server](https://github.com/tymmesyde/peario-server) - into a single monorepo, with their full original commit history preserved under `client/` and `server/`.

## Structure

- [`client/`](client) - the Vue 3 frontend (see [client/README.md](client/README.md) for setup)
- [`server/`](server) - the Node/TypeScript WebSocket relay (see [server/README.md](server/README.md) for setup)

## Running locally

Both halves need to be running for the app to work end to end:

1. Set up and start `server/` first (needs a local SSL cert and a `.env` file - see its README).
2. Set up and start `client/` (`pnpm i && pnpm serve`), pointed at the local server via `client/.env.development`.
3. Open the client in your browser. You must have Stremio installed and running locally to create a room and stream.

## License

MIT - see [LICENSE](LICENSE). The original upstream projects carried no license.
