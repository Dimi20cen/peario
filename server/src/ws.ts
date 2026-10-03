import https from 'https';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { Client, User } from './shared';
import { ServerEvent, ReadyEvent } from './shared/events/server';
import { ClientEvent } from './shared/events/client';
import { logger } from './common/logger';

class WS {

    private wss: WebSocket.Server;
    public events = new EventEmitter;
    public clients: Client[] = [];

    constructor(server: https.Server, cleanInterval: number) {
        this.wss = new WebSocket.Server({ server });
        this.wss.on('connection', (socket: WebSocket) => {
            const client = new Client(socket);
            client.sendEvent(new ReadyEvent(new User(client)));
            client.onMessage((data: string) => this.handleEvents(client, data));
            socket.on('close', () => this.removeClient(client));
            // Browsers answer protocol pings themselves, even in background tabs where the
            // page's own heartbeat timer gets slowed to about once a minute.
            socket.on('pong', () => client.last_active = Date.now());
            this.clients.push(client);
            logger.info({ user: client.name }, 'connected');
        });

        // Close connections that stop answering pings. Closing (rather than just
        // forgetting the client) lets the room drop them and the page notice;
        // a forgotten-but-open connection could still send but never received
        // room updates, leaving pages stuck on "loading the room".
        setInterval(() => {
            const now = Date.now();
            this.clients.forEach(client => {
                if (now - client.last_active > cleanInterval * 3) {
                    logger.info({ room: client.room_id, user: client.name }, 'stopped answering, closing connection');
                    client.terminate();
                } else {
                    client.ping();
                }
            });
        }, cleanInterval);
    }

    private handleEvents(client: Client, data: string) {
        client.last_active = Date.now();
        let event;
        try {
            event = JSON.parse(data);
        } catch {
            logger.warn({ room: client.room_id, user: client.name }, 'unreadable message from client');
            return;
        }

        try {
            this.events.emit(event.type, <ClientEvent>{ client, payload: event.payload });
        } catch (error) {
            logger.error({ room: client.room_id, user: client.name }, 'error while handling message', {
                type: event.type,
                error: error instanceof Error ? error.stack : error,
            });
        }
    }

    public removeClient(client: Client) {
        this.clients = this.clients.filter(c => c !== client);
        this.events.emit('client.disconnected', <ClientEvent>{ client, payload: {} });
    }

    public getClientsByRoomId(room_id: string) {
        return this.clients.filter(client => client.room_id === room_id);
    }

    public sendToClients(clients: Client[], event: ServerEvent) {
        clients.forEach(c => c.sendEvent(event));
    }

    public sendToRoomClients(room_id: string, event: ServerEvent) {
        const clients = this.getClientsByRoomId(room_id);
        this.sendToClients(clients, event);
    }

}

export default WS;