const WebSocket = require('ws');
const { EventEmitter } = require('events');

// ------ Server ------
/**
 * Create a new server
 * @constructor
 * @param {number} port - Choose the port for the server to listen to.
 */
class Server extends EventEmitter {
    constructor(port) {
        super();
        if (typeof port !== 'number') throw Error('Expected type: number');

        this.clients = [];
        this.rooms = [];
        this.port = port;
        this.server = new WebSocket.Server({ port });

        this.server.on('connection', ws => {
            ws.id = `0${Math.round(Math.random() * 10000000000000000)}`;
            ws.user = new User(ws);
            this.clients.push(ws.user);
            this.emit('connection', ws.user);

            ws.on('message', msg => {
                if (!JSON.parse(msg).socketry) {
                    let msgB = JSON.parse(msg);
                    delete msgB.sendRoomName;
                    ws.user.emit('message', JSON.stringify(msgB), this.rooms.filter(r => r.name == JSON.parse(msg).sendRoomName)[0]);
                } else if (JSON.parse(msg).type === 'joinRoom') {
                    if (!this.rooms.length) ws.send(JSON.stringify({socketry: true, type: 'Error', details: {error: 'No rooms available'}}));
                    if (!this.rooms.filter(r => r.name == JSON.parse(msg).details.name)) ws.send(JSON.stringify({socketry: true, type: 'Error', details: {error: 'No rooms with that name'}}));
                    
                    let name = JSON.parse(msg).details.name;
                    this.rooms.filter(r => r.name == name)[0].clients.push(ws);
                    ws.send(JSON.stringify({socketry: true, type: 'roomJoined', details: {room: {id: this.rooms.filter(r => r.name == name)[0].id, name: this.rooms.filter(r => r.name == name)[0].name}}}));
                } else if (JSON.parse(msg).type === 'leaveRoom') {
                    let name = JSON.parse(msg).details.name;
                    this.rooms.filter(r => r.name == name)[0].clients = this.rooms.filter(r => r.name == name)[0].clients.filter(c => c.id !== ws.id);
                    ws.send(JSON.stringify({socketry: true, type: 'roomLeft', details: {name: JSON.parse(msg).details.name, clients: this.rooms.filter(r => r.name == name)[0].clients.length}}));
                }
            });

            ws.on('close', () => {
                ws.user.emit('end', this.clients.filter(c => c.server.readyState !== 1)[0]);
                this.clients = this.clients.filter(c => c.server.readyState === 1);
                this.rooms.forEach(r => {
                    r.clients = r.clients.filter(c => c.readyState === 1);
                });
            });
        });
    }

    /**
     * Create a new room
     * @param {string} room - Name of the room you would like to connect to
     */
    get Room() {
        return room.bind(null, this);
    }
}

/**
 * The room class. New rooms can be created with the Server class
 */
class room extends EventEmitter {
    constructor (server, name) {
        super();
        this.id = `1${Math.round(Math.random() * 10000000000000000)}`;
        this.oname = name;
        if(!server.rooms.filter(r => r.oname === name).length) {
            this.name = name;
        } else {
            this.name = `${name}-${server.rooms.filter(r => r.oname === name).length}`;
        }
        this.clients = [];
        this.server = {
            port: server.port,
            socket: server.server
        };
        server.rooms.push(this);
    }
}

/**
 * The user class which is passed down to the server connection event (ids start with a '0')
 * @constructor
 */
class User extends EventEmitter {
    constructor(ws) {
        super();
        this.server = ws;
    }

    /**
     * Send data to a client
     * @param {string} msg - The message content
     */
    send(msg) {
        this.server.send(msg);
    }
}

// ------ Client ------
/**
 * The Client class
 * @constructor
 * @param {string} url - Connect to a socketry server (ids start with a '0')
 */
class Client extends EventEmitter {
    constructor(url) {
        super();
        if (typeof url !== 'string') throw Error('Expected type: number');
        this.url = url;
        this.client = new WebSocket(url);
        this.rooms = [];

        this.client.on('open', () => {
            this.emit('open');

            this.client.on('message', data => {
                try {
                    if (JSON.parse(data).type == 'Error') {
                        throw Error(JSON.parse(data).details.error);
                    } else if (JSON.parse(data).type == 'roomJoined') {
                        this.rooms.push(JSON.parse(data).details.room);
                        this.emit('join', new clientRoom(JSON.parse(data).details.room, this));
                    } else if (JSON.parse(data).type == 'roomLeft') {
                        this.emit('leave', JSON.stringify({name: JSON.parse(data).name, clients: JSON.parse(data).clients}));
                    }
                } catch (err) {}
            });
        });
    }

    /**
     * End the client connection
     */
    end() {
        this.client.close();
    }

    /**
     * Join a room
     * @param {string} room - Name of the room you would like to join
     */
    joinRoom(room) {
        if (typeof room !== 'string') throw Error('Expected type: string');
        this.client.send(JSON.stringify({socketry: true, type: 'joinRoom', details: {name: room}}));
        // {socketry: true, type: 'joinRoom', details: {name: room}}
    }
}

class clientRoom extends EventEmitter {
    constructor (room, main) {
        super();
        this.room = room;
        this.main = main;

        this.main.client.on('message', data => {
            try {
                JSON.parse(data);
            } catch (err) {
                this.emit('message', data);
            }
        });
    }

    /**
     * Send data to a room
     * @param {object} msg - The message content
     */
    send(msg) {
        if (typeof msg !== 'object') throw Error('Expected type: object');
        msg.sendRoomName = this.room.name;
        this.main.client.send(JSON.stringify(msg));
    }

    /** Leave a room
     */
    leave() {
        this.main.rooms = this.main.rooms.filter(r => r.name !== this.room.name);
        this.main.client.send(JSON.stringify({socketry: true, type: 'leaveRoom', details: this.room}));
    }
}

module.exports = { Server, Client };