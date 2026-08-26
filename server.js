const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

// អានទិន្នន័យពី JSON File បើគ្មានបង្កើតថ្មី
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading data.json:', err);
  }
  return {
    users: [
      { id: 1, username: 'admin', password: '123', role: 'admin', assignedRoom: 'all', isBlocked: false }
    ],
    rooms: ['room-1', 'room-2']
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving data.json:', err);
  }
}

let db = loadData();
const roomUsers = {};

// API Login
app.post('/api/login', (req, res) => {
  const { username, password, roomId } = req.body;
  const user = db.users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return res.status(401).json({ success: false, message: 'ឈ្មោះ ឬលេខសម្ងាត់មិនត្រឹមត្រូវ!' });
  }

  if (user.isBlocked) {
    return res.status(403).json({ success: false, message: 'គណនីរបស់អ្នកត្រូវបានផ្អាកដំណើរការ (Blocked)!' });
  }

  if (user.role !== 'admin' && user.assignedRoom !== roomId) {
    return res.status(403).json({ 
      success: false, 
      message: `អ្នកមិនមានសិទ្ធិចូលបន្ទប់ ${roomId} ទេ! បន្ទប់របស់អ្នកគឺ ${user.assignedRoom}` 
    });
  }

  res.json({ 
    success: true, 
    user: { 
      id: user.id,
      username: user.username, 
      role: user.role, 
      assignedRoom: user.assignedRoom 
    } 
  });
});

// API យកបញ្ជី User
app.get('/api/users', (req, res) => {
  const safeUsers = db.users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    assignedRoom: u.assignedRoom,
    isBlocked: u.isBlocked
  }));
  res.json({ users: safeUsers });
});

// API បង្កើត User
app.post('/api/create-user', (req, res) => {
  const { username, password, assignedRoom } = req.body;
  if (!username || !password || !assignedRoom) {
    return res.status(400).json({ message: 'សូមបំពេញព័ត៌មានឱ្យគ្រប់!' });
  }
  
  const exists = db.users.find(u => u.username === username);
  if (exists) return res.status(400).json({ message: 'ឈ្មោះ User នេះមានរួចហើយ!' });

  db.users.push({
    id: Date.now(),
    username,
    password,
    role: 'member',
    assignedRoom,
    isBlocked: false
  });
  saveData(db);
  res.json({ success: true, message: `បង្កើត User ជោគជ័យ សម្រាប់បន្ទប់ ${assignedRoom}!` });
});

// API លុប User
app.delete('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const user = db.users.find(u => u.id === id);
  if (user && user.role === 'admin') {
    return res.status(400).json({ message: 'មិនអាចលុបគណនី Admin បានទេ!' });
  }
  db.users = db.users.filter(u => u.id !== id);
  saveData(db);
  res.json({ success: true, message: 'លុប User រួចរាល់!' });
});

// API Reset Password
app.put('/api/users/:id/reset-password', (req, res) => {
  const id = parseInt(req.params.id);
  const { newPassword } = req.body;
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ message: 'រកមិនឃើញ User ទេ!' });

  user.password = newPassword;
  saveData(db);
  res.json({ success: true, message: `ប្តូរ Password របស់ ${user.username} ជោគជ័យ!` });
});

// API Block / Unblock User
app.put('/api/users/:id/toggle-block', (req, res) => {
  const id = parseInt(req.params.id);
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ message: 'រកមិនឃើញ User ទេ!' });
  if (user.role === 'admin') return res.status(400).json({ message: 'មិនអាច Block Admin បានទេ!' });

  user.isBlocked = !user.isBlocked;
  saveData(db);
  res.json({ 
    success: true, 
    message: `${user.isBlocked ? 'បានផ្អាក (Blocked)' : 'បានបើកដំណើរការ (Unblocked)'} User ${user.username} រួចរាល់!`,
    isBlocked: user.isBlocked
  });
});

// API Edit Room
app.put('/api/users/:id/edit-room', (req, res) => {
  const id = parseInt(req.params.id);
  const { newRoom } = req.body;
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ message: 'រកមិនឃើញ User ទេ!' });

  user.assignedRoom = newRoom;
  saveData(db);
  res.json({ success: true, message: `បានប្តូរបន្ទប់របស់ ${user.username} ទៅ ${newRoom} រួចរាល់!` });
});

// API បង្កើតបន្ទប់
app.post('/api/create-room', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះបន្ទប់!' });

  if (db.rooms.includes(roomId)) {
    return res.status(400).json({ message: 'បន្ទប់នេះមានរួចហើយ!' });
  }

  db.rooms.push(roomId);
  saveData(db);
  res.json({ success: true, message: 'បង្កើតបន្ទប់ជោគជ័យ!', rooms: db.rooms });
});

// API យកបន្ទប់សកម្ម
app.get('/api/rooms-status', (req, res) => {
  const roomsData = db.rooms.map(r => {
    const activeMembers = roomUsers[r] ? roomUsers[r].length : 0;
    return {
      roomId: r,
      userCount: activeMembers,
      users: roomUsers[r] ? roomUsers[r].map(u => u.username) : []
    };
  });
  res.json({ rooms: roomsData });
});

app.get('/api/rooms', (req, res) => {
  res.json({ rooms: db.rooms });
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
