const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: "*" 
  },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));

// រក្សាទុកអ្នកប្រើប្រាស់ក្នុងបន្ទប់
const roomUsers = {};

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  socket.on('join-room', (roomId, peerId) => {
    console.log(`📥 User ${peerId} joined room ${roomId}`);
    
    socket.join(roomId);
    
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }
    
    // ពិនិត្យមើលថាអ្នកប្រើនេះមានរួចហើយឬនៅ
    const existingUser = roomUsers[roomId].find(u => u.peerId === peerId);
    if (!existingUser) {
      roomUsers[roomId].push({ socketId: socket.id, peerId });
    }

    // ផ្ញើ peerId របស់អ្នកដទៃទៅអ្នកប្រើថ្មី
    const otherUsers = roomUsers[roomId].filter(u => u.peerId !== peerId);
    otherUsers.forEach(user => {
      socket.emit('user-connected', user.peerId);
    });

    // ជូនដំណឹងដល់អ្នកដទៃថាមានអ្នកថ្មី
    socket.to(roomId).emit('user-connected', peerId);

    socket.on('disconnect', () => {
      console.log(`🔌 User ${peerId} disconnected from room ${roomId}`);
      
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(
          user => user.socketId !== socket.id
        );
        if (roomUsers[roomId].length === 0) {
          delete roomUsers[roomId];
        }
      }
      socket.to(roomId).emit('user-disconnected', peerId);
    });
  });

  socket.on('refresh-media', (roomId) => {
    socket.to(roomId).emit('refresh-media');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
