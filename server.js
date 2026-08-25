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

// រក្សាទុកព័ត៌មានអ្នកប្រើក្នុងបន្ទប់
const roomUsers = {};
// រក្សាទុកអ្នកដែលកំពុង Share Screen
const screenSharingUsers = {};

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  socket.on('join-room', (roomId, peerId, username) => {
    console.log(`📥 User ${username} (${peerId}) joined room ${roomId}`);
    socket.join(roomId);
    
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }
    
    // រក្សាទុកព័ត៌មានអ្នកប្រើ
    const userData = { socketId: socket.id, peerId, username };
    const existingUser = roomUsers[roomId].find(u => u.peerId === peerId);
    if (!existingUser) {
      roomUsers[roomId].push(userData);
    }

    // **សំខាន់៖ ប្រសិនបើមានអ្នកកំពុង Share Screen ក្នុងបន្ទប់**
    if (screenSharingUsers[roomId]) {
      socket.emit('screen-share-active', {
        peerId: screenSharingUsers[roomId].peerId,
        username: screenSharingUsers[roomId].username
      });
    }

    // ផ្ញើបញ្ជីអ្នកប្រើក្នុងបន្ទប់ទៅអ្នកថ្មី
    const otherUsers = roomUsers[roomId].filter(u => u.peerId !== peerId);
    otherUsers.forEach(user => {
      socket.emit('user-connected', user.peerId, user.username);
    });

    // ជូនដំណឹងអ្នកដទៃថាមានអ្នកថ្មី
    socket.to(roomId).emit('user-connected', peerId, username);

    socket.on('disconnect', () => {
      console.log(`🔌 User ${username} (${peerId}) disconnected from room ${roomId}`);
      
      // ប្រសិនបើអ្នកដែលចាកចេញកំពុង Share Screen
      if (screenSharingUsers[roomId] && screenSharingUsers[roomId].peerId === peerId) {
        delete screenSharingUsers[roomId];
        socket.to(roomId).emit('screen-share-stopped');
      }

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

  // **សំខាន់៖ ពេលអ្នកប្រើចាប់ផ្តើម Share Screen**
  socket.on('start-screen-share', (roomId, peerId, username) => {
    console.log(`🖥️ ${username} (${peerId}) started screen sharing in room ${roomId}`);
    
    screenSharingUsers[roomId] = { peerId, username };
    
    // ជូនដំណឹងអ្នកទាំងអស់ក្នុងបន្ទប់
    socket.to(roomId).emit('screen-share-active', { peerId, username });
  });

  // **សំខាន់៖ ពេលអ្នកប្រើបញ្ឈប់ Share Screen**
  socket.on('stop-screen-share', (roomId) => {
    console.log(`🛑 Screen sharing stopped in room ${roomId}`);
    
    delete screenSharingUsers[roomId];
    
    // ជូនដំណឹងអ្នកទាំងអស់ក្នុងបន្ទប់
    socket.to(roomId).emit('screen-share-stopped');
  });

  socket.on('refresh-media', (roomId) => {
    socket.to(roomId).emit('refresh-media');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
