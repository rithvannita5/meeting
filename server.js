const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));

// រក្សាទុកព័ត៌មានអ្នកប្រើប្រាស់
const roomUsers = {};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-room', (roomId, peerId) => {
    socket.join(roomId);
    
    // រក្សាទុកព័ត៌មាន
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }
    roomUsers[roomId].push({ socketId: socket.id, peerId });

    // ជូនដំណឹងដល់អ្នកផ្សេងក្នុងបន្ទប់
    socket.to(roomId).emit('user-connected', peerId);
    console.log(`User ${peerId} joined room ${roomId}`);

    socket.on('disconnect', () => {
      // លុបអ្នកប្រើប្រាស់ចេញពីបញ្ជី
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(
          user => user.socketId !== socket.id
        );
        if (roomUsers[roomId].length === 0) {
          delete roomUsers[roomId];
        }
      }
      socket.to(roomId).emit('user-disconnected', peerId);
      console.log(`User ${peerId} disconnected from room ${roomId}`);
    });
  });

  socket.on('refresh-media', (roomId) => {
    socket.to(roomId).emit('refresh-media');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
