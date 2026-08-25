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

const roomUsers = {};

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  socket.on('join-room', (roomId, peerId, username) => {
    console.log(`📥 ${username} (${peerId}) joined room ${roomId}`);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.peerId = peerId;
    socket.data.username = username;
    
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }
    
    const existingUser = roomUsers[roomId].find(u => u.peerId === peerId);
    if (!existingUser) {
      roomUsers[roomId].push({ socketId: socket.id, peerId, username });
    }

    // **សំខាន់៖ ផ្ញើបញ្ជីអ្នកប្រើទាំងអស់**
    const allUsers = roomUsers[roomId].filter(u => u.peerId !== peerId);
    socket.emit('all-users', allUsers);

    // **សំខាន់៖ ជូនដំណឹងអ្នកដទៃ**
    socket.to(roomId).emit('user-joined', { peerId, username });

    socket.on('disconnect', () => {
      console.log(`🔌 ${socket.data.username} (${socket.data.peerId}) disconnected`);
      
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(
          user => user.socketId !== socket.id
        );
        socket.to(roomId).emit('user-left', socket.data.peerId);
        
        if (roomUsers[roomId].length === 0) {
          delete roomUsers[roomId];
        }
      }
    });
  });

  socket.on('get-users', (roomId) => {
    if (roomUsers[roomId]) {
      const users = roomUsers[roomId].filter(u => u.socketId !== socket.id);
      socket.emit('all-users', users);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
