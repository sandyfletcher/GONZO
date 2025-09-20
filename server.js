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
      participants: [{ id: socket.id, username: socket.id.slice(0, 6) }]
    };
    socket.emit('room_created', roomId);
    console.log(`Room created with ID: ${roomId} by ${socket.id}`);
    updateParticipants(roomId);
  });
  socket.on('join_room', (data) => {
    // **KEY CHANGE 2**: Expect an object with roomId and potentially oldSocketId
    const { roomId, oldSocketId } = data; 
    if (rooms[roomId]) {
      const room = rooms[roomId];
      socket.join(roomId);
      // **KEY CHANGE 3**: Check if this is the owner rejoining after page load
      if (oldSocketId && room.owner === oldSocketId) {
        console.log(`Owner ${oldSocketId} is rejoining as ${socket.id}`);
        // Update the owner's socket ID to the new one
        room.owner = socket.id;
        // Find and update their ID in the participants list as well
        const ownerParticipant = room.participants.find(p => p.id === oldSocketId);
        if (ownerParticipant) {
            ownerParticipant.id = socket.id;
        }
      } else {
        // This is a regular new user joining
        const newUser = { id: socket.id, username: socket.id.slice(0, 6) };
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
            sender: sender, // Now sending { id: '...', username: '...' }
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
        // **KEY CHANGE 4**: Add a delay to the owner disconnect logic
        // This gives them time to reconnect on the new page before we close the room.
        setTimeout(() => {
          // Re-check if the room and owner still exist and haven't been updated
          if (rooms[roomId] && rooms[roomId].owner === socket.id) {
            console.log(`Owner of room ${roomId} disconnected and did not rejoin. Closing room.`);
            io.to(roomId).emit('room_closed', 'The host has left the room.');
            delete rooms[roomId];
          } else { 
            // If it wasn't the owner, or if the owner has already reconnected (and their ID updated),
            // just remove the old participant record if it still exists.
            if (rooms[roomId]) {
                const currentParticipantIndex = rooms[roomId].participants.findIndex(p => p.id === socket.id);
                if (currentParticipantIndex > -1) {
                    rooms[roomId].participants.splice(currentParticipantIndex, 1);
                    updateParticipants(roomId);
                }
            }
          }
        }, 2500); // Wait 2.5 seconds before closing the room
        break; // A user can only be in one room, so we can stop searching.
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});