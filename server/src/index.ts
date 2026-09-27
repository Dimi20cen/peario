import fs from 'fs';
import https from 'https';
import WS from './ws';
import { PORT, PEM_CERT, PEM_KEY, INTERVAL_CLIENT_CHECK, INTERVAL_ROOM_UPDATE } from './common/config';
import { ClientEvent, ClientIdentify, ClientNewRoom, CientJoinRoom, ClientMessage, ClientSync, ClientUserUpdate, ClientUpdateOwnership, ClientPlayerLoading, ClientLog } from './shared/events/client';
import { RoomEvent, SyncEvent, MessageEvent, ErrorEvent, UserEvent } from './shared/events/server';
import RoomManager from './room';
import { Client, User } from './shared';
import { logger } from './common/logger';

const server = https.createServer({
    cert: fs.readFileSync(PEM_CERT),
    key: fs.readFileSync(PEM_KEY)
}, (req, res) => {
    res.writeHead(200);
    res.end();
}).listen(PORT);

logger.info({}, `listening on port ${PORT}`);

const wss = new WS(server, INTERVAL_CLIENT_CHECK);
const roomManager = new RoomManager();

const contextOf = (client: Client) => ({ room: client.room_id, user: client.name });

wss.events.on('client.identify', identifyClient);
wss.events.on('client.disconnected', onClientDisconnected);
wss.events.on('user.update', updateUser);
wss.events.on('room.new', createRoom);
wss.events.on('room.join', joinRoom);
wss.events.on('room.message', messageRoom);
wss.events.on('room.updateOwnership', updateRoomOwnership);
wss.events.on('player.sync', syncPlayer);
wss.events.on('player.loading', updatePlayerLoading);
wss.events.on('client.log', logFromClient);
wss.events.on('heartbeat', heartbeat);

function identifyClient({ client, payload }: ClientIdentify) {
    const { id } = payload;

    // Adopt the client's own persisted id so a page refresh reconnects as the
    // same identity instead of a random new one - otherwise a refreshing room
    // owner loses ownership, since `room.owner === client.id` stops matching.
    if (typeof id === 'string' && id.length > 0) {
        client.id = id;
        client.name = `Guest${id.slice(0, 4)}`;

        // The client already has its old (pre-identify) id from the initial
        // ReadyEvent sent at connection time, before this message was even
        // processed. Without telling it about the swap, its own view of
        // "who am I" never matches room.owner, and every client - not just
        // ones that reconnected - would fail the ownership check.
        client.sendEvent(new UserEvent(new User(client)));
        logger.info(contextOf(client), 'identified');
    }
}

function onClientDisconnected({ client }: ClientEvent) {
    const room = roomManager.getClientRoom(client);
    logger.info(contextOf(client), room ? 'disconnected and left room' : 'disconnected');
    if (!room) return;

    room.users = room.users.filter(({ id }) => id !== client.id);
    wss.sendToRoomClients(room.id, new SyncEvent(room));
}

function updateUser({ client, payload }: ClientUserUpdate) {
    const { username } = payload;

    if (username.length > 0) {
        const previousName = client.name;
        client.name = username.slice(0, 25);
        logger.info(contextOf(client), 'renamed', { from: previousName });

        const user = new User(client);
        client.sendEvent(new UserEvent(user));

        const room = roomManager.getClientRoom(client);
        if (room) {
            roomManager.updateUser(room.id, user);
            wss.sendToRoomClients(room.id, new SyncEvent(room));
        }
    }
}

function createRoom({ client, payload }: ClientNewRoom) {
    const room = roomManager.create(client, payload);
    client.sendEvent(new RoomEvent(room));

    const { stream, meta } = room;
    logger.info({ room: room.id, user: client.name }, 'created room', {
        title: meta.name,
        stream: stream.infoHash ? `torrent ${stream.infoHash}${stream.fileIdx !== undefined ? ` file ${stream.fileIdx}` : ''}` : stream.url,
    });
}

function joinRoom({ client, payload }: CientJoinRoom) {
    const { id } = payload;

    const room = roomManager.join(client, id);
    if (!room) {
        logger.warn({ user: client.name }, 'tried to join a room that does not exist', { code: id });
        return client.sendEvent(new ErrorEvent('room'));
    }

    logger.info(contextOf(client), 'joined room', { users: room.users.length });
    wss.sendToRoomClients(room.id, new SyncEvent(room));
}

function messageRoom({ client, payload }: ClientMessage) {
    const room = roomManager.getClientRoom(client);
    if (!room) return client.sendEvent(new ErrorEvent('room'));

    if (payload.content) {
        const event = new MessageEvent(client, payload.content);
        if ((event.payload.date - client.cooldown) / 1000 < 3) return client.sendEvent(new ErrorEvent('cooldown'));

        wss.sendToRoomClients(room.id, event);
        client.resetCooldown();
    }
}

function updateRoomOwnership({ client, payload }: ClientUpdateOwnership) {
    const room = roomManager.getClientRoom(client);
    if (!room) return client.sendEvent(new ErrorEvent('room'));

    if (payload && payload.userId && room.owner === client.id) {
        const roomUser = room.users.find(({ id, room_id }) => id === payload.userId && room_id === room.id);

        if (!roomUser) return client.sendEvent(new ErrorEvent('user'));

        const updatedRoom = roomManager.updateOwner(room.id, roomUser);
        if (updatedRoom) {
            logger.info(contextOf(client), 'gave room ownership', { to: roomUser.name });
            wss.sendToRoomClients(updatedRoom.id, new SyncEvent(updatedRoom));
        }
    }
}

function updatePlayerLoading({ client, payload }: ClientPlayerLoading) {
    const loading = !!(payload && payload.loading);
    if (loading !== client.loading) logger.info(contextOf(client), loading ? 'picture loading, room waiting' : 'picture ready');
    client.loading = loading;

    const room = roomManager.getClientRoom(client);
    if (!room) return;

    roomManager.updateUser(room.id, new User(client));
    wss.sendToRoomClients(room.id, new SyncEvent(room));
}

function syncPlayer({ client, payload: player }: ClientSync) {
    const room = roomManager.getClientRoom(client);
    if (!room) return client.sendEvent(new ErrorEvent('room'));
    
    if (room.owner === client.id) {
        if (player.paused !== room.player.paused)
            logger.info(contextOf(client), player.paused ? 'paused' : 'playing', { at: formatTime(player.time) });
        room.player = player;

        const clients = wss.getClientsByRoomId(room.id).filter(c => c.id !== client.id);
        wss.sendToClients(clients, new SyncEvent(room));
    } else {
        client.sendEvent(new SyncEvent(room));
    }
}

function heartbeat({ client }: ClientEvent) {
    client.last_active = new Date().getTime();
}

const formatTime = (seconds: number) => {
    const total = Math.floor(Number(seconds) || 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};

const CLIENT_LOG_LIMIT_PER_MINUTE = 30;
const clientLogBudget = new WeakMap<Client, { windowStart: number, count: number }>();

function logFromClient({ client, payload }: ClientLog) {
    const now = Date.now();
    const budget = clientLogBudget.get(client) || { windowStart: now, count: 0 };
    if (now - budget.windowStart > 60000) {
        budget.windowStart = now;
        budget.count = 0;
    }
    budget.count++;
    clientLogBudget.set(client, budget);
    if (budget.count > CLIENT_LOG_LIMIT_PER_MINUTE) return;

    const level = payload && ['info', 'warn', 'error'].includes(payload.level) ? payload.level : 'info';
    const message = `browser: ${String((payload && payload.message) || '').slice(0, 300)}`;
    const details = payload && payload.details && typeof payload.details === 'object' ? payload.details : {};
    const trimmed = Object.fromEntries(Object.entries(details).slice(0, 20).map(([key, value]) => [key.slice(0, 40), String(typeof value === 'object' ? JSON.stringify(value) : value).slice(0, 500)]));

    logger[level](contextOf(client), message, trimmed);
    if (budget.count === CLIENT_LOG_LIMIT_PER_MINUTE) logger.warn(contextOf(client), 'browser log limit reached, dropping further messages this minute');
}

setInterval(() => {
    roomManager.rooms = roomManager.rooms
        .map(room => {
            const tmp_users = room.users;
            room.users = room.users.filter(user => wss.clients.find(client => client.id === user.id));

            if (JSON.stringify(room.users) !== JSON.stringify(tmp_users)) wss.sendToRoomClients(room.id, new SyncEvent(room));
            return room;
        })
        // Once every user has left (and stayed gone for a full sweep, giving a
        // refreshing client time to reconnect and rejoin first), drop the room
        // entirely - otherwise rooms.length only ever grows for the life of the
        // process, since nothing else ever removes a room.
        .filter(room => {
            if (room.users.length === 0) logger.info({ room: room.id }, 'closed empty room');
            return room.users.length > 0;
        });
}, INTERVAL_ROOM_UPDATE);