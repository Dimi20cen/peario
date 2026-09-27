import Client from "./client";

class User {
    id: string;
    name: string;
    room_id: string;
    loading: boolean;

    constructor(client: Client) {
        this.id = client.id;
        this.name = client.name;
        this.room_id = client.room_id;
        this.loading = client.loading;
    }
}

export default User;