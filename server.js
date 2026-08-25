const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// ទុកទិន្នន័យបន្ទប់ និង User
const rooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', (roomId, username) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    
    // បន្ថែម Socket ID ទៅក្នុងបន្ទប់
    rooms[roomId].push(socket.id);

    // ផ្ញើបញ្ជីអ្នកដែលមានស្រាប់ក្នុងបន្ទប់ទៅឱ្យ User ថ្មី
    const otherUsers = rooms[roomId].filter(id => id !== socket.id);
    socket.emit('all-users', otherUsers);

    // ប្រាប់អ្នកចាស់ក្នុងបន្ទប់ថាមាន User ថ្មីចូលមក
    socket.to(roomId).emit('user-connected', socket.id);
  });

  // បញ្ជូនកញ្ចប់ Signaling (Offer, Answer, ICE Candidate)
  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });

  // ពេល User ចាកចេញ ឬបិទ Tab
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('user-disconnected', socket.id);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
