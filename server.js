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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin ដើម (assignedRoom: 'all' អាចចូលបានគ្រប់បន្ទប់)
const users = [
  { username: 'admin', password: '123', role: 'admin', assignedRoom: 'all' }
];

const rooms = ['room-1', 'room-2'];
const roomUsers = {};

// API Login
app.post('/api/login', (req, res) => {
  const { username, password, roomId } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return res.status(401).json({ success: false, message: 'ឈ្មោះ ឬលេខសម្ងាត់មិនត្រឹមត្រូវ!' });
  }

  // Admin អាចចូលបានគ្រប់បន្ទប់ ចំណែក Member ចូលបានតែបន្ទប់កំណត់
  if (user.role !== 'admin' && user.assignedRoom !== roomId) {
    return res.status(403).json({ 
      success: false, 
      message: `អ្នកមិនមានសិទ្ធិចូលបន្ទប់ ${roomId} ទេ! បន្ទប់របស់អ្នកគឺ ${user.assignedRoom}` 
    });
  }

  res.json({ 
    success: true, 
    user: { 
      username: user.username, 
      role: user.role, 
      assignedRoom: user.assignedRoom 
    } 
  });
});

// API Admin បង្កើត User
app.post('/api/create-user', (req, res) => {
  const { username, password, assignedRoom } = req.body;
  if (!username || !password || !assignedRoom) {
    return res.status(400).json({ message: 'សូមបំពេញព័ត៌មានឱ្យគ្រប់!' });
  }
  
  const exists = users.find(u => u.username === username);
  if (exists) return res.status(400).json({ message: 'ឈ្មោះ User នេះមានរួចហើយ!' });

  users.push({ username, password, role: 'member', assignedRoom });
  res.json({ success: true, message: `បង្កើត User ជោគជ័យ សម្រាប់បន្ទប់ ${assignedRoom}!` });
});

// API Admin បង្កើតបន្ទប់ថ្មី
app.post('/api/create-room', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះបន្ទប់!' });

  if (rooms.includes(roomId)) {
    return res.status(400).json({ message: 'បន្ទប់នេះមានរួចហើយ!' });
  }

  rooms.push(roomId);
  res.json({ success: true, message: 'បង្កើតបន្ទប់ជោគជ័យ!', rooms });
});

// API យកបញ្ជីបន្ទប់ និងចំនួនមនុស្សកំពុងនៅខាងក្នុង
app.get('/api/rooms-status', (req, res) => {
  const roomsData = rooms.map(r => {
    const activeMembers = roomUsers[r] ? roomUsers[r].length : 0;
    return {
      roomId: r,
      userCount: activeMembers,
      users: roomUsers[r] ? roomUsers[r].map(u => u.username) : []
    };
  });
  res.json({ rooms: roomsData });
});

// API យកបញ្ជីឈ្មោះបន្ទប់សាមញ្ញ
app.get('/api/rooms', (req, res) => {
  res.json({ rooms });
});

// Socket.io
io.on('connection', (socket) => {
  socket.on('join-room', (roomId, peerId, username) => {
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

    const allUsers = roomUsers[roomId].filter(u => u.peerId !== peerId);
    socket.emit('all-users', allUsers);
    socket.to(roomId).emit('user-joined', { peerId, username });

    socket.on('disconnect', () => {
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(user => user.socketId !== socket.id);
        socket.to(roomId).emit('user-left', socket.data.peerId);
        if (roomUsers[roomId].length === 0) {
          delete roomUsers[roomId];
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
