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
            this.clients.push(client);
            logger.info({ user: client.name }, 'connected');
        });

        // Clean clients when inactive
        setInterval(() => this.clients = this.clients.filter(c => (new Date().getTime() - c.last_active) < cleanInterval), cleanInterval);
    }

    private handleEvents(client: Client, data: string) {
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