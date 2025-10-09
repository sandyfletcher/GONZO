const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://caecus.ca", "https://www.caecus.ca"], // allow both root and www
    methods: ["GET", "POST"]
  }
});
app.use(express.static(__dirname)); // serve static files (HTML, CSS, JS, images) from current directory
const rooms = {};
const MAX_HISTORY = 10; // max number of messages/events to store per room
const createRoomIPs = new Map(); // rate limiting
const CREATE_ROOM_LIMIT = 3; // max 3 rooms per IP per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const ROOM_INACTIVITY_LIMIT = 2 * 60 * 60 * 1000; // 2 hours
const WARN_AFTER_1H_INACTIVITY = 60 * 60 * 1000;     // Warn after 1h of no messages
const WARN_AFTER_90M_INACTIVITY = 90 * 60 * 1000;    // Warn after 90m of no messages
const WARN_AFTER_110M_INACTIVITY = 110 * 60 * 1000;  // Warn after 110m (1h 50m) of no messages

setInterval(() => { // clear IP tracker every minute
    createRoomIPs.clear();
}, RATE_LIMIT_WINDOW);

setInterval(() => { // check all rooms once every minute
    const now = Date.now();
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const inactivityDuration = now - room.lastMessageTimestamp;

        if (inactivityDuration >= ROOM_INACTIVITY_LIMIT) { // limit reached — close and delete room
            // console.log(`Room ${roomId} closed due to inactivity.`);
            io.to(roomId).emit('room_closed', 'room closed due to inactivity.');
            delete rooms[roomId]; // free up memory
        }
        // check warningsCHECK WARNINGS (ordered from most urgent to least)
        else if (inactivityDuration >= WARN_AFTER_110M_INACTIVITY && !room.warningsSent.w10m) {
            broadcastUserEvent(roomId, 'room will close in 10 minutes due to inactivity');
            room.warningsSent.w10m = true;
            room.warningsSent.w30m = true;
            room.warningsSent.w1h = true;
        }
        else if (inactivityDuration >= WARN_AFTER_90M_INACTIVITY && !room.warningsSent.w30m) {
            broadcastUserEvent(roomId, 'room will close in 30 minutes due to inactivity');
            room.warningsSent.w30m = true;
            room.warningsSent.w1h = true;
        }
        else if (inactivityDuration >= WARN_AFTER_1H_INACTIVITY && !room.warningsSent.w1h) {
            broadcastUserEvent(roomId, 'room will close in 1 hour due to inactivity');
            room.warningsSent.w1h = true;
        }
    }
}, 60 * 1000); // run every 60 seconds

// HELPER FUNCTIONS

const updateParticipants = (roomId) => {
    if (rooms[roomId]) {
        const room = rooms[roomId];
        const participantsWithOwnership = room.participants.map(p => ({
            ...p, // copy existing participant properties (id, username, token)
            isOwner: p.id === room.owner // add the new property
        }));
        io.to(roomId).emit('update_participants', participantsWithOwnership);
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
    // add a global room limit
    const MAX_ROOMS = 1000; // Choose a reasonable number for your server's memory
    if (Object.keys(rooms).length >= MAX_ROOMS) {
        socket.emit('create_error', 'Server is currently at full capacity. Please try again later.');
        console.log('Max room limit reached. Denying new room creation.');
        return;
    }
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    const ipCount = createRoomIPs.get(clientIp) || 0;
    if (ipCount >= CREATE_ROOM_LIMIT) {
        console.log(`Rate limit exceeded for IP: ${clientIp}`);
        socket.emit('create_error', "You're creating rooms too quickly. Please wait a moment.");
        return;
    }
    createRoomIPs.set(clientIp, ipCount + 1);
    const roomId = uuidv4();
    socket.join(roomId);
    const ownerToken = uuidv4();
    rooms[roomId] = {
      owner: socket.id,
      lastMessageTimestamp: Date.now(),
      warningsSent: {
          w1h: false,
          w30m: false,
          w10m: false
      },
      participants: [{
          id: socket.id,
          username: socket.id.slice(0, 5),
          token: ownerToken
      }],
      messageHistory: []
    };
    socket.emit('room_created', { roomId, token: ownerToken });
    // console.log(`Room created: ${roomId} by ${socket.id}`);
    updateParticipants(roomId);
    broadcastUserEvent(roomId, 'room initiated — will self-destruct after 2 hours of inactivity');
}

// **MODIFIED:** Slightly refactored for clarity
function handleJoinRoom(socket, data) {
    if (typeof data !== 'object' || data === null || typeof data.roomId !== 'string' || data.roomId.length > 40) return;
    if (data.participantToken && (typeof data.participantToken !== 'string' || data.participantToken.length > 40)) return;

    const { roomId, participantToken } = data;
    const room = rooms[roomId];
    if (!room) {
        return socket.emit('join_error', 'This room does not exist.');
    }

    // Case 1: User is already in the room (e.g., host's first join, or a reconnect)
    const existingParticipant = room.participants.find(p => p.id === socket.id || (participantToken && p.token === participantToken));

    if (existingParticipant) {
        // If they reconnected with a new socket ID, update it
        const oldId = existingParticipant.id;
        if (oldId !== socket.id) {
            existingParticipant.id = socket.id;
            if (room.owner === oldId) { // Check if the reconnected user was the owner
                room.owner = socket.id;
            }
        }
        // The client's UI is now ready, so send everything it needs to render
        socket.join(roomId);
        socket.emit('load_history', {
            history: room.messageHistory,
            token: existingParticipant.token // Send them back their token
        });
        updateParticipants(roomId); // Crucial for host and reconnecting clients
        return;
    }

    // Case 2: A genuinely new user is joining
    const newUserToken = uuidv4();
    const newUser = {
        id: socket.id,
        username: socket.id.slice(0, 5),
        token: newUserToken
    };
    room.participants.push(newUser);
    
    socket.join(roomId);
    updateParticipants(roomId);
    broadcastUserEvent(roomId, `${newUser.username} joined`);
    
    // Send the history and their new personal token
    socket.emit('load_history', {
        history: room.messageHistory,
        token: newUserToken
    });
}

function handleSendMessage(socket, data) {
    if (typeof data.roomId !== 'string' || typeof data.message !== 'string') return;
    const { roomId, message } = data;
    const cleanMessage = DOMPurify.sanitize(message);
    if (cleanMessage.trim().length === 0 || cleanMessage.length > 500) return;
    const room = rooms[roomId];
    if (!room) return;
    const sender = room.participants.find(p => p.id === socket.id);
    if (sender) {
        room.lastMessageTimestamp = Date.now(); // reset clock
        room.warningsSent = { w1h: false, w30m: false, w10m: false };
        // console.log(`Activity in room ${roomId}. Inactivity timer reset.`);
        const messageData = { sender, message: cleanMessage };
        io.to(roomId).emit('receive_message', messageData);
        addToHistory(roomId, 'message', messageData);
    }
}
function handleDisconnect(socket) {
    // console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const participantIndex = room.participants.findIndex(p => p.id === socket.id);
        if (participantIndex !== -1) {
            const participant = room.participants[participantIndex];
            const username = participant.username; // Get username before they are removed
            setTimeout(() => { // set grace period to allow for reconnection
                if (!rooms[roomId]) return; // Room might have been closed already
                // Check if the participant is still in the list with the *same old socket.id*.
                // If they reconnected, handleJoinRoom would have updated their id.
                const participantStillExistsWithOldId = rooms[roomId].participants.some(p => p.id === socket.id);
                if (participantStillExistsWithOldId) {
                    // This means they did NOT reconnect successfully within the grace period.
                    // Case 1: The owner left. Close the room.
                    if (rooms[roomId].owner === socket.id) {
                        // console.log(`Owner ${username} (${socket.id}) of room ${roomId} did not reconnect. Closing room.`);
                        io.to(roomId).emit('room_closed', 'Host has left the room; connection terminated.');
                        delete rooms[roomId];
                        return; // Stop further processing for this room
                    }
                    // Case 2: A regular participant left.
                    // console.log(`Participant ${username} (${socket.id}) left room ${roomId}.`);
                    rooms[roomId].participants = rooms[roomId].participants.filter(p => p.id !== socket.id);
                    updateParticipants(roomId);
                    broadcastUserEvent(roomId, `${username} left`);
                } else { // participant is no longer in list with old ID
                    // console.log(`Participant ${username} (${socket.id}) reconnected successfully with a new ID.`);
                }
            }, 10000); // 10-second grace period
            return; // use return to exit function once room is found
        }
    }
}

// CONNECTION LOGIC

io.on('connection', (socket) => {
  // console.log(`User connected: ${socket.id}`);
  socket.on('create_room',  () => handleCreateRoom(socket));
  socket.on('join_room',    (data) => handleJoinRoom(socket, data));
  socket.on('send_message', (data) => handleSendMessage(socket, data));
  socket.on('disconnect',   () => handleDisconnect(socket));
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  // console.log(`Server listening on port ${PORT}`);
});