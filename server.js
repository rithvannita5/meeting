const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io',
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DATA STORES
const rooms = [{ id: 'room-1', name: 'បន្ទប់ទី ១' }, { id: 'room-2', name: 'បន្ទប់ទី ២' }];
const users = [
  { username: 'admin', password: '123', role: 'admin' },
  { username: 'user1', password: '123', role: 'user' },
  { username: 'user2', password: '123', role: 'user' }
];

// USER SESSIONS FOR 2FA TRACKING
// { "username": { "deviceId1": socketId, "deviceId2": socketId } }
const userSessions = {};
const pendingOTP = {};

// REST API
app.get('/api/rooms', (req, res) => res.json(rooms));

app.post('/api/login', (req, res) => {
  const { username, password, roomId, deviceId } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) return res.status(401).json({ success: false, message: 'Password មិនត្រឹមត្រូវ!' });

  if (!userSessions[username]) userSessions[username] = {};

  const activeDevices = Object.keys(userSessions[username]);

  // 2FA LOGIC: ឆែកតែ Username មួយនេះ! បើកំពុង Login លើ Device ផ្សេងស្រាប់ហើយ -> ទាមទារ 2FA
  if (activeDevices.length > 0 && !userSessions[username][deviceId]) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    pendingOTP[username] = otp;

    // ផ្ញើ OTP ទៅ Device ទី១ តាម Socket
    const firstDeviceId = activeDevices[0];
    const firstSocketId = userSessions[username][firstDeviceId];
    if (firstSocketId) {
      io.to(firstSocketId).emit('receive-otp', { otp: otp });
    }

    return res.json({ require2FA: true, message: 'គណនីនេះកំពុងប្រើលើ Device ផ្សេង។ ត្រូវការ OTP 2FA!' });
  }

  const peerId = 'peer_' + username + '_' + Math.random().toString(36).substr(2, 5);
  res.json({ success: true, role: user.role, peerId: peerId });
});

app.post('/api/verify-2fa', (req, res) => {
  const { username, otp, deviceId } = req.body;
  if (pendingOTP[username] && pendingOTP[username] === otp) {
    delete pendingOTP[username];
    const user = users.find(u => u.username === username);
    const peerId = 'peer_' + username + '_' + Math.random().toString(36).substr(2, 5);
    res.json({ success: true, role: user.role, peerId: peerId });
  } else {
    res.status(400).json({ success: false, message: 'លេខ OTP មិនត្រឹមត្រូវ!' });
  }
});

app.get('/api/rooms/status', (req, res) => {
  const status = rooms.map(r => {
    const roomSockets = io.sockets.adapter.rooms.get(r.id);
    return { id: r.id, name: r.name, users: roomSockets ? Array.from(roomSockets) : [] };
  });
  res.json(status);
});

// SOCKET.IO EVENTS
const socketUserMap = {}; // socket.id -> { username, peerId, roomId, deviceId }

io.on('connection', (socket) => {
  
  socket.on('join-room', (data) => {
    const { roomId, peerId, username, deviceId } = data;
    socket.join(roomId);

    socketUserMap[socket.id] = { username, peerId, roomId, deviceId };

    if (!userSessions[username]) userSessions[username] = {};
    if (deviceId) userSessions[username][deviceId] = socket.id;

    // ផ្ញើបញ្ជីអ្នកនៅក្នុង Room ទៅកាន់អ្នកចូលថ្មី
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const existingUsers = clients
      .filter(id => id !== socket.id && socketUserMap[id])
      .map(id => ({ peerId: socketUserMap[id].peerId, username: socketUserMap[id].username }));

    socket.emit('room-joined', { roomId, existingUsers });
    socket.to(roomId).emit('user-joined', { peerId, username });
  });

  socket.on('send-private-message', (data) => {
    const targetSocketId = Object.keys(socketUserMap).find(id => socketUserMap[id].peerId === data.toPeerId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive-private-message', {
        fromPeerId: socketUserMap[socket.id]?.peerId,
        fromUsername: data.fromUsername,
        message: data.message
      });
    }
  });

  // REMOTE CONTROL PASSTHROUGH
  socket.on('request-remote-control', (data) => {
    const targetSocketId = Object.keys(socketUserMap).find(id => socketUserMap[id].peerId === data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('remote-control-request', { controllerId: data.controllerId, requestId: socket.id });
    }
  });

  socket.on('remote-mouse-move', (data) => {
    const targetSocketId = Object.keys(socketUserMap).find(id => socketUserMap[id].peerId === data.targetId);
    if (targetSocketId) io.to(targetSocketId).emit('remote-mouse-move', data);
  });

  socket.on('remote-mouse-click', (data) => {
    const targetSocketId = Object.keys(socketUserMap).find(id => socketUserMap[id].peerId === data.targetId);
    if (targetSocketId) io.to(targetSocketId).emit('remote-mouse-click', data);
  });

  socket.on('disconnect', () => {
    const userData = socketUserMap[socket.id];
    if (userData) {
      const { username, peerId, roomId, deviceId } = userData;
      socket.to(roomId).emit('user-left', { peerId });

      if (userSessions[username] && deviceId) {
        delete userSessions[username][deviceId];
        if (Object.keys(userSessions[username]).length === 0) delete userSessions[username];
      }
      delete socketUserMap[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
