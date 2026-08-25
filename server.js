const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { PeerServer } = require('peer');

const app = express();
const server = http.createServer(app);

// ======== បង្កើត PeerJS Server ========
const peerServer = PeerServer({
  port: 9000,
  path: '/myapp',
  allow_discovery: true
});

// ======== Socket.io Server ========
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
    
    // ពិនិត្យមើលថាតើ peerId នេះមានរួចហើយឬនៅ
    const existingUser = roomUsers[roomId].find(u => u.peerId === peerId);
    if (!existingUser) {
      roomUsers[roomId].push({ socketId: socket.id, peerId });
    }

    // **សំខាន់៖ ផ្ញើ peerId របស់អ្នកដទៃទៅអ្នកប្រើថ្មី**
    const otherUsers = roomUsers[roomId].filter(u => u.peerId !== peerId);
    console.log(`👥 Other users in room:`, otherUsers.map(u => u.peerId));
    
    otherUsers.forEach(user => {
      socket.emit('user-connected', user.peerId);
      console.log(`📤 Sent user-connected for ${user.peerId} to ${peerId}`);
    });

    // **សំខាន់៖ ជូនដំណឹងដល់អ្នកដទៃថាមានអ្នកថ្មី**
    socket.to(roomId).emit('user-connected', peerId);
    console.log(`📤 Broadcast user-connected ${peerId} to room ${roomId}`);

    // ======== Signal Handling ========
    socket.on('signal', (data) => {
      console.log(`📡 Signal from ${data.peerId} to room ${data.roomId}`);
      socket.to(data.roomId).emit('signal', data);
    });

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

// ======== Start Servers ========
const PORT = process.env.PORT || 3000;
const PEER_PORT = process.env.PEER_PORT || 9000;

server.listen(PORT, () => {
  console.log(`🚀 HTTP Server is running on port ${PORT}`);
  console.log(`🔗 Socket.io Server is running on port ${PORT}`);
  console.log(`🆔 PeerJS Server is running on port ${PEER_PORT}`);
});

// ======== Handle Peer Server Errors ========
peerServer.on('connection', (client) => {
  console.log(`🔗 Peer client connected: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`🔌 Peer client disconnected: ${client.getId()}`);
});
