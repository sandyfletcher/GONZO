const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});
app.use(express.static(__dirname)); // serve static files (HTML, CSS, JS, images) from current directory
const rooms = {};
const MAX_HISTORY = 10; // max number of messages/events to store per room
const createRoomIPs = new Map(); // rate limiting
const CREATE_ROOM_LIMIT = 3; // max 3 rooms per IP per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
setInterval(() => { // clear IP tracker every minute
    createRoomIPs.clear();
}, RATE_LIMIT_WINDOW);

// HELPER FUNCTIONS

const updateParticipants = (roomId) => {
    if (rooms[roomId]) {
        io.to(roomId).emit('update_participants', rooms[roomId].participants);
    }
};
const addToHistory = (roomId, type, data) => {
    if (!rooms[roomId]) return;
    const history = rooms[roomId].messageHistory;
    history.push({ type, data });
    if (history.length > MAX_HISTORY) {
        history.shift(); // remove oldest item if history is full
    }
};
const broadcastUserEvent = (roomId, text) => { // broadcast a user event (join/leave) and add it to history
    if (rooms[roomId]) {
        const eventData = { text };
        io.to(roomId).emit('user_event', eventData);
        addToHistory(roomId, 'event', eventData); // also store event in history
    }
};

// EVENT HANDLERS

function handleCreateRoom(socket) {
    const clientIp = socket.handshake.address;
    const ipCount = createRoomIPs.get(clientIp) || 0;
    if (ipCount >= CREATE_ROOM_LIMIT) {
        console.log(`Rate limit exceeded for IP: ${clientIp}`);
        return; // stop execution
    }
    createRoomIPs.set(clientIp, ipCount + 1);
    const roomId = uuidv4();
    socket.join(roomId);
    rooms[roomId] = {
      owner: socket.id,
      participants: [{ id: socket.id, username: socket.id.slice(0, 5) }],
      messageHistory: [] // initialize history buffer for room
    };
    socket.emit('room_created', roomId);
    console.log(`Room created: ${roomId} by ${socket.id} (IP: ${clientIp})`);
    updateParticipants(roomId);
}

function handleJoinRoom(socket, data) {
    if (typeof data !== 'object' || data === null) return;
    if (typeof data.roomId !== 'string' || data.roomId.length > 40) return;
    if (data.oldSocketId && (typeof data.oldSocketId !== 'string' || data.oldSocketId.length > 25)) return;
    const { roomId, oldSocketId } = data;
    const room = rooms[roomId];
    if (!room) {
        return socket.emit('join_error', 'This room does not exist.');
    }
    socket.join(roomId);
    let username;
    let isNewJoiner = true; // flag to check if we should announce join
    const reconnectingParticipant = oldSocketId ? room.participants.find(p => p.id === oldSocketId) : null; // logic to handle any reconnecting user
    if (reconnectingParticipant) {
        console.log(`User ${oldSocketId} rejoining as ${socket.id}`);
        reconnectingParticipant.id = socket.id; // update participant's ID to new socket.id
        if (room.owner === oldSocketId) { // if rejoining user was owner, update owner reference as well
            room.owner = socket.id;
        }
        username = reconnectingParticipant.username; // keep same username
        isNewJoiner = false; // it's a reconnect, not a new joiner
    } else {
        const newUser = { // brand new user joining room
            id: socket.id,
            username: socket.id.slice(0, 5)
        };
        room.participants.push(newUser);
        username = newUser.username;
    }
    console.log(`User ${socket.id} (${username}) joined room ${roomId}`);
    updateParticipants(roomId);
    if (isNewJoiner && username) { // announce join event only for genuinely new users
        broadcastUserEvent(roomId, `${username} joined`);
    }
    socket.emit('load_history', room.messageHistory); // send existing message history
}

function handleSendMessage(socket, data) {
    if (typeof data.roomId !== 'string' || typeof data.message !== 'string') return;
    const { roomId, message } = data;
    if (message.trim().length === 0 || message.length > 500) return;
    const room = rooms[roomId];
    if (!room) return;
    const sender = room.participants.find(p => p.id === socket.id);
    if (sender) {
        const messageData = { sender, message };
        io.to(roomId).emit('receive_message', messageData);
        addToHistory(roomId, 'message', messageData); // add message to history
    }
}

function handleDisconnect(socket) {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const participantIndex = room.participants.findIndex(p => p.id === socket.id);
        if (participantIndex !== -1) {
            const participant = room.participants[participantIndex];
            const username = participant.username; // Get username before they are removed
            // Set a grace period to allow for reconnection
            setTimeout(() => {
                if (!rooms[roomId]) return; // Room might have been closed already
                // Check if the participant is still in the list with the *same old socket.id*.
                // If they reconnected, handleJoinRoom would have updated their id.
                const participantStillExistsWithOldId = rooms[roomId].participants.some(p => p.id === socket.id);
                if (participantStillExistsWithOldId) {
                    // This means they did NOT reconnect successfully within the grace period.
                    // Case 1: The owner left. Close the room.
                    if (rooms[roomId].owner === socket.id) {
                        console.log(`Owner ${username} (${socket.id}) of room ${roomId} did not reconnect. Closing room.`);
                        io.to(roomId).emit('room_closed', 'The host has left the room.');
                        delete rooms[roomId];
                        return; // Stop further processing for this room
                    }
                    // Case 2: A regular participant left.
                    console.log(`Participant ${username} (${socket.id}) left room ${roomId}.`);
                    rooms[roomId].participants = rooms[roomId].participants.filter(p => p.id !== socket.id);
                    updateParticipants(roomId);
                    broadcastUserEvent(roomId, `${username} left`);
                } else {
                    // The participant is no longer in the list with the old ID,
                    // which means handleJoinRoom successfully updated them.
                    console.log(`Participant ${username} (${socket.id}) reconnected successfully with a new ID.`);
                }
            }, 3000); // 3-second grace period
            break; // Found the room, no need to check others
        }
    }
}

// CONNECTION LOGIC

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.on('create_room',  () => handleCreateRoom(socket));
  socket.on('join_room',    (data) => handleJoinRoom(socket, data));
  socket.on('send_message', (data) => handleSendMessage(socket, data));
  socket.on('disconnect',   () => handleDisconnect(socket));
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});