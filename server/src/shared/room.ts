import User from "./user";
import Stream from "./stream";
import Player from "./player";
import Meta from "./meta";

interface RoomOptions {
    meta: Meta;
    stream: Stream;
}

// Excludes visually ambiguous characters (0/O, 1/I/L) so codes are easy to
// read aloud and type on a phone.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

function generateRoomId(): string {
    let id = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return id;
}

class Room {
    public id: string;
    public stream: Stream;
    public meta: Meta;
    public users: User[];
    public player: Player;
    public owner?: string;

    constructor(options: RoomOptions) {
        this.id = generateRoomId();
        this.stream = new Stream(options.stream);
        this.meta = new Meta(options.meta);
        this.player = new Player();
        this.users = [];
    }
};

export {
    Room,
    RoomOptions,
    generateRoomId
};