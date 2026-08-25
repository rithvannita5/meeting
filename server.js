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

io.on('connection', (socket) => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    // ប្រាប់អ្នកនៅក្នុងបន្ទប់ចាស់ថាមានអ្នកថ្មីចូលមក
    socket.to(roomId).emit('user-connected', socket.id);

    // បញ្ជូនទិន្នន័យ Signaling រវាងអ្នកទាំងពីរ
    socket.on('signal', (data) => {
      socket.to(roomId).emit('signal', {
        from: socket.id,
        signal: data.signal
      });
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected', socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
