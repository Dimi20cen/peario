import { EventEmitter } from 'events';
import hat from 'hat';
import StorageService from '@/services/storage.service';

const ClientService = {

    socket: null,
    heartbeat: null,
    events: new EventEmitter,

    connect(url) {
        this.socket = new WebSocket(url);
        this.socket.onopen = this._handleOpen.bind(this);
        this.socket.onclose = () => this.events.emit('closed');
        this.socket.onmessage = this._handleMessage.bind(this);
    },

    _handleOpen() {
        this.events.emit('opened');
        // Persisted across reloads so a refresh reconnects as the same
        // identity - otherwise the server can't tell a refreshing room owner
        // apart from a brand new guest, and ownership is lost on refresh.
        this.send('client.identify', { id: this.getClientId() });
        this.heartbeat = setInterval(() => this.send('heartbeat', {}), 2000);
    },

    getClientId() {
        let id = StorageService.get('client.id');
        if (!id) {
            id = hat();
            StorageService.set('client.id', id);
        }
        return id;
    },

    _handleMessage(msg) {
        const { type, payload } = this.parseEvents(msg);
        this.events.emit(type, payload);
    },

    send(type, payload) {
        this.socket.send(JSON.stringify({ type, payload }));
    },

    parseEvents(msg) {
        const { data } = msg;
        const { type, payload } = JSON.parse(data);
        return { type, payload };
    }

};

export default ClientService;