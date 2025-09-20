const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
  }
});
const rooms = {};
const updateParticipants = (roomId) => {
    if (rooms[roomId]) {
        io.to(roomId).emit('update_participants', rooms[roomId].participants);
    }
};
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.on('create_room', () => {
    const roomId = uuidv4();
    socket.join(roomId);
    rooms[roomId] = {
      owner: socket.id,
      participants: [{ id: socket.id, username: 'user-' + socket.id.substr(0, 6) }]
    };
    socket.emit('room_created', roomId);
    console.log(`Room created with ID: ${roomId} by ${socket.id}`);
    updateParticipants(roomId);
  });
  socket.on('join_room', (data) => {
    const { roomId, oldSocketId } = data; // expect an object now
    if (rooms[roomId]) {
      const room = rooms[roomId];
      socket.join(roomId);
      // check if this is the owner rejoining after page load
      if (oldSocketId && room.owner === oldSocketId) {
        console.log(`Owner ${oldSocketId} is rejoining as ${socket.id}`);
        // update the owner's socket ID to the new one
        room.owner = socket.id;
        // find and update their ID in the participants list as well
        const ownerParticipant = room.participants.find(p => p.id === oldSocketId);
        if (ownerParticipant) {
            ownerParticipant.id = socket.id;
        }
      } else {
        // this is a regular new user joining
        const newUser = { id: socket.id, username: 'user-' + socket.id.substr(0, 6) };
        room.participants.push(newUser);
      }
      console.log(`User ${socket.id} joined room ${roomId}`);
      updateParticipants(roomId);
    } else {
      socket.emit('join_error', 'This room does not exist.');
    }
  });
  socket.on('send_message', (data) => {
    const { roomId, message } = data;
    const sender = rooms[roomId]?.participants.find(p => p.id === socket.id);
    if (sender) {
        io.to(roomId).emit('receive_message', {
            username: sender.username,
            message: message
        });
    }
  });
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const participantIndex = room.participants.findIndex(p => p.id === socket.id);
      if (participantIndex > -1) {
        setTimeout(() => { // Use a timeout to delay the check slightly. This helps prevent the owner from being disconnected during the page transition race condition.
          if (rooms[roomId] && rooms[roomId].owner === socket.id) { // Re-verify the room and owner still exist, as the owner might have reconnected.
            console.log(`Owner of room ${roomId} disconnected and did not rejoin. Closing room.`);
            io.to(roomId).emit('room_closed', 'The host has left the room.');
            delete rooms[roomId];
          } else { // If it wasn't the owner, or if the owner has already been updated, just remove the participant
            if (rooms[roomId]) {
                const currentParticipantIndex = rooms[roomId].participants.findIndex(p => p.id === socket.id);
                if (currentParticipantIndex > -1) {
                    rooms[roomId].participants.splice(currentParticipantIndex, 1);
                    updateParticipants(roomId);
                }
            }
          }
        }, 2500); // Wait a while before closing the room
        break;
      }
    }
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});