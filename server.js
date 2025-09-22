const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});
const rooms = {};
const MAX_HISTORY = 20; // Max number of messages/events to store per room

// --- HELPER FUNCTIONS ---

const updateParticipants = (roomId) => {
    if (rooms[roomId]) {
        io.to(roomId).emit('update_participants', rooms[roomId].participants);
    }
};

// NEW: Helper to add an item to a room's history
const addToHistory = (roomId, type, data) => {
    if (!rooms[roomId]) return;
    const history = rooms[roomId].messageHistory;
    history.push({ type, data });
    if (history.length > MAX_HISTORY) {
        history.shift(); // Remove the oldest item if history is full
    }
};

// NEW: Helper to broadcast a user event (join/leave) and add it to history
const broadcastUserEvent = (roomId, text) => {
    if (rooms[roomId]) {
        const eventData = { text };
        io.to(roomId).emit('user_event', eventData);
        addToHistory(roomId, 'event', eventData); // Also store event in history
    }
};

// --- EVENT HANDLERS ---

function handleCreateRoom(socket) {
    const roomId = uuidv4();
    socket.join(roomId);
    rooms[roomId] = {
      owner: socket.id,
      participants: [{ id: socket.id, username: socket.id.slice(0, 5) }],
      messageHistory: [] // NEW: Initialize the history buffer for the room
    };
    socket.emit('room_created', roomId);
    console.log(`Room created: ${roomId} by ${socket.id}`);
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
    let isNewJoiner = true; // Flag to check if we should announce the join

    if (oldSocketId && room.owner === oldSocketId) {
        console.log(`Owner ${oldSocketId} rejoining as ${socket.id}`);
        room.owner = socket.id;
        const ownerParticipant = room.participants.find(p => p.id === oldSocketId);
        if (ownerParticipant) {
            ownerParticipant.id = socket.id;
            username = ownerParticipant.username;
            isNewJoiner = false; // It's a reconnect, not a new user
        }
    } else {
        const newUser = {
            id: socket.id,
            username: socket.id.slice(0, 5)
        };
        room.participants.push(newUser);
        username = newUser.username;
    }

    console.log(`User ${socket.id} (${username}) joined room ${roomId}`);
    updateParticipants(roomId);

    // announce join event for new users
    if (isNewJoiner && username) {
        broadcastUserEvent(roomId, `${username} joined the room.`);
    }

    // NEW: Send existing message history to the newly joined user
    socket.emit('load_history', room.messageHistory);
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
        addToHistory(roomId, 'message', messageData); // NEW: Add message to history
    }
}

function handleDisconnect(socket) {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const participant = room.participants.find(p => p.id === socket.id);

        if (participant) {
            setTimeout(() => {
                if (rooms[roomId] && rooms[roomId].owner === socket.id) {
                    console.log(`Owner of ${roomId} left. Closing room.`);
                    io.to(roomId).emit('room_closed', 'The host has left the room.');
                    delete rooms[roomId];
                } else if (rooms[roomId]) {
                    const currentParticipantIndex = rooms[roomId].participants.findIndex(p => p.id === socket.id);
                    if (currentParticipantIndex > -1) {
                         const leavingUser = rooms[roomId].participants.splice(currentParticipantIndex, 1)[0];
                         updateParticipants(roomId);
                         broadcastUserEvent(roomId, `${leavingUser.username} left the room`); // announce user left
                    }
                }
            }, 3000); // 3 second grace period
            break;
        }
    }
}

// --- CONNECTION LOGIC ---

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