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

// --- Helper Functions ---

const updateParticipants = (roomId) => {
    if (rooms[roomId]) {
        io.to(roomId).emit('update_participants', rooms[roomId].participants);
    }
};

// --- Event Handlers ---

function handleCreateRoom(socket) {
    const roomId = uuidv4();
    socket.join(roomId);
    rooms[roomId] = {
      owner: socket.id,
      participants: [{ id: socket.id, username: socket.id.slice(0, 5) }]
    };
    socket.emit('room_created', roomId);
    console.log(`Room created: ${roomId} by ${socket.id}`);
    updateParticipants(roomId);
}

function handleJoinRoom(socket, data) {
    const { roomId, oldSocketId } = data;
    const room = rooms[roomId];

    if (!room) {
        return socket.emit('join_error', 'This room does not exist.');
    }

    socket.join(roomId);
    
    // Check if it's the owner rejoining after page load
    if (oldSocketId && room.owner === oldSocketId) {
        console.log(`Owner ${oldSocketId} rejoining as ${socket.id}`);
        room.owner = socket.id;
        const ownerParticipant = room.participants.find(p => p.id === oldSocketId);
        if (ownerParticipant) {
            ownerParticipant.id = socket.id;
        }
    } else {
        // A regular new user is joining
        const newUser = { 
            id: socket.id, 
            username: socket.id.slice(0, 5)
        };
        room.participants.push(newUser);
    }

    console.log(`User ${socket.id} joined room ${roomId}`);
    updateParticipants(roomId);
}

function handleSendMessage(socket, data) {
    if (typeof data.roomId !== 'string' || typeof data.message !== 'string') return;
    const { roomId, message } = data;
    if (message.trim().length === 0 || message.length > 500) return;

    const room = rooms[roomId];
    if (!room) return;

    const sender = room.participants.find(p => p.id === socket.id);
    if (sender) {
        io.to(roomId).emit('receive_message', { sender, message });
    }
}

function handleDisconnect(socket) {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const participantIndex = room.participants.findIndex(p => p.id === socket.id);

        if (participantIndex > -1) {
            // Clever timeout allows owner to rejoin on new page before room is destroyed.
            setTimeout(() => {
                // Re-check state after the delay
                if (rooms[roomId] && rooms[roomId].owner === socket.id) {
                    console.log(`Owner of ${roomId} left. Closing room.`);
                    io.to(roomId).emit('room_closed', 'The host has left the room.');
                    delete rooms[roomId];
                } else if (rooms[roomId]) {
                    // It wasn't the owner, or the owner already reconnected.
                    // Just remove the old participant record if it still exists.
                    const currentParticipantIndex = rooms[roomId].participants.findIndex(p => p.id === socket.id);
                    if (currentParticipantIndex > -1) {
                         rooms[roomId].participants.splice(currentParticipantIndex, 1);
                         updateParticipants(roomId);
                    }
                }
            }, 2500); // 2.5 second grace period
            break; // User can only be in one room
        }
    }
}

// --- Main Connection Logic ---

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