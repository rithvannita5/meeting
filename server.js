const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// Express Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Express PeerServer
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peerjs', peerServer);

// ========== Socket.IO Config ==========
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowUpgrades: false, // បិទការ Upgrade ដើម្បីកាត់បន្ថយ Error លើ Render Proxy
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8
});

io.engine.on("connection_error", (err) => {
  console.log('❌ Socket.IO engine error:', err);
});

// ========== Base Routes ==========
app.get('/ping', (req, res) => res.send('pong'));

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.use('/icons', express.static(path.join(__dirname, 'public', 'icons')));
app.get('/icons/*', (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="100" fill="#00b4d8"/>
    <text x="256" y="340" font-family="Arial" font-size="280" font-weight="bold" fill="white" text-anchor="middle">VC</text>
  </svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

app.get('/favicon.ico', (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="#00b4d8"/>
    <text x="32" y="44" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle">VC</text>
  </svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

// ========== MongoDB Atlas Config ==========
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://rithvannita5_db_user:81Aokzd93Q9Vu3Xb@cluster0.oaj62a4.mongodb.net/meetingDB?retryWrites=true&w=majority&appName=Cluster0";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user', enum: ['admin', 'supervisor', 'user'] },
  assignedRoom: { type: String, default: 'room-1' },
  isBlocked: { type: Boolean, default: false }
});

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true }
});

const remoteControlSchema = new mongoose.Schema({
  controllerId: { type: String, required: true },
  targetId: { type: String, required: true },
  roomId: { type: String, required: true },
  status: { type: String, default: 'pending' }
});

const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);
const RemoteControl = mongoose.model('RemoteControl', remoteControlSchema);

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas!');
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      await User.create({ username: 'admin', password: '123', role: 'admin', assignedRoom: 'all', isBlocked: false });
    }
    const defaultRoom1 = await Room.findOne({ roomId: 'room-1' });
    if (!defaultRoom1) await Room.create({ roomId: 'room-1' });
    const defaultRoom2 = await Room.findOne({ roomId: 'room-2' });
    if (!defaultRoom2) await Room.create({ roomId: 'room-2' });
  })
  .catch(err => console.error('MongoDB Error:', err));

const roomUsers = {};
const activeSockets = new Map();
const otpStore = {};

// ========== REST APIs ==========
app.post('/api/login', async (req, res) => {
  const { username, password, roomId } = req.body;
  try {
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ success: false, message: 'ឈ្មោះ ឬលេខសម្ងាត់មិនត្រឹមត្រូវ!' });
    if (user.isBlocked) return res.status(403).json({ success: false, message: 'គណនីត្រូវបានផ្អាក!' });

    if (user.role !== 'admin' && user.role !== 'supervisor' && user.assignedRoom !== roomId) {
      return res.status(403).json({ success: false, message: `អ្នកគ្មានសិទ្ធិចូលបន្ទប់ ${roomId} ទេ!` });
    }

    let onlineSockets = [];
    for (let [sId, data] of activeSockets.entries()) {
      if (data.username === username) onlineSockets.push(sId);
    }

    if (onlineSockets.length > 0) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore[username] = otp;
      onlineSockets.forEach(sId => io.to(sId).emit('receive-otp', { otp, ip: req.ip }));
      io.emit('admin-alert', { username: username, count: onlineSockets.length + 1 });
      return res.json({ success: false, requires2FA: true, message: 'គណនីរបស់អ្នកកំពុង Online នៅឧបករណ៍ផ្សេង។ សូមបញ្ចូលលេខកូដ 2FA!' });
    }

    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role, assignedRoom: user.assignedRoom } });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.post('/api/verify-2fa', async (req, res) => {
  const { username, password, otp } = req.body;
  if (otpStore[username] && otpStore[username] === otp) {
    delete otpStore[username];
    const user = await User.findOne({ username, password });
    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role, assignedRoom: user.assignedRoom } });
  } else {
    res.status(401).json({ success: false, message: '❌ លេខកូដ 2FA មិនត្រឹមត្រូវទេ!' });
  }
});

app.post('/api/change-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  try {
    const user = await User.findOne({ username, password: oldPassword });
    if (!user) return res.status(401).json({ success: false, message: '❌ លេខសម្ងាត់ចាស់មិនត្រឹមត្រូវទេ!' });
    user.password = newPassword; await user.save();
    res.json({ success: true, message: '✅ ប្តូរលេខសម្ងាត់បានជោគជ័យ!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.get('/api/users', async (req, res) => {
  try { 
    const users = await User.find({}, '-password'); 
    res.json({ users: users.map(u => ({ id: u._id, username: u.username, role: u.role, assignedRoom: u.assignedRoom, isBlocked: u.isBlocked })) }); 
  } catch (err) { res.status(500).json({ message: 'Error fetching users' }); }
});

const handleCreateUser = async (req, res) => {
  const { username, password, assignedRoom, role } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'សូមបំពេញព័ត៌មានឱ្យគ្រប់!' });
  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: 'ឈ្មោះ User នេះមានរួចហើយ!' });
    await User.create({ username, password, assignedRoom: assignedRoom || 'room-1', role: role || 'user' });
    res.json({ success: true, message: 'បង្កើត User ជោគជ័យ!' });
  } catch (err) { res.status(500).json({ message: 'Error creating user' }); }
};

app.post('/api/create-user', handleCreateUser);
app.post('/api/users/create', handleCreateUser);

app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user && (user.role === 'admin' || user.role === 'supervisor')) {
      return res.status(400).json({ message: 'មិនអាចលុប Admin ឬ Supervisor បានទេ!' });
    }
    await User.findByIdAndDelete(req.params.id); 
    res.json({ success: true, message: 'លុប User រួចរាល់!' });
  } catch (err) { res.status(500).json({ message: 'Error deleting user' }); }
});

app.put('/api/users/:id/reset-password', async (req, res) => {
  try { 
    const user = await User.findById(req.params.id);
    if (user && user.role === 'admin') {
      return res.status(400).json({ message: 'មិនអាចប្តូរលេខសម្ងាត់ Admin បានទេ!' });
    }
    await User.findByIdAndUpdate(req.params.id, { password: req.body.newPassword }); 
    res.json({ success: true, message: 'ប្តូរ Password ជោគជ័យ!' }); 
  } catch (err) { res.status(500).json({ message: 'Error updating password' }); }
});

app.put('/api/users/:id/toggle-block', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user.role === 'admin' || user.role === 'supervisor') {
      return res.status(400).json({ message: 'មិនអាច Block Admin ឬ Supervisor បានទេ!' });
    }
    user.isBlocked = !user.isBlocked; await user.save(); 
    res.json({ success: true, message: 'ប្តូរស្ថានភាពរួចរាល់!' });
  } catch (err) { res.status(500).json({ message: 'Error updating status' }); }
});

app.put('/api/users/:id/edit-room', async (req, res) => {
  try { 
    await User.findByIdAndUpdate(req.params.id, { assignedRoom: req.body.newRoom }); 
    res.json({ success: true, message: 'ប្តូរបន្ទប់រួចរាល់!' }); 
  } catch (err) { res.status(500).json({ message: 'Error updating room' }); }
});

app.put('/api/users/:id/edit-role', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'មិនអាចប្តូរ Role របស់ Admin បានទេ!' });
    }
    const { newRole } = req.body;
    if (!['admin', 'supervisor', 'user'].includes(newRole)) {
      return res.status(400).json({ message: 'Role មិនត្រឹមត្រូវទេ!' });
    }
    user.role = newRole;
    await user.save();
    res.json({ success: true, message: 'ប្តូរ Role ជោគជ័យ!' });
  } catch (err) { res.status(500).json({ message: 'Error updating role' }); }
});

const handleCreateRoom = async (req, res) => {
  const roomId = req.body.roomId || req.body.roomName;
  if (!roomId) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះបន្ទប់!' });
  try {
    const exists = await Room.findOne({ roomId });
    if (exists) return res.status(400).json({ message: 'បន្ទប់នេះមានរួចហើយ!' });
    await Room.create({ roomId }); 
    res.json({ success: true, message: 'បង្កើតបន្ទប់ជោគជ័យ!' });
  } catch (err) { res.status(500).json({ message: 'Error creating room' }); }
};

app.post('/api/create-room', handleCreateRoom);
app.post('/api/rooms/create', handleCreateRoom);

app.get('/api/rooms-status', async (req, res) => {
  try {
    const rooms = await Room.find();
    const roomsData = rooms.map(r => ({
      roomId: r.roomId,
      userCount: roomUsers[r.roomId] ? roomUsers[r.roomId].length : 0,
      users: roomUsers[r.roomId] ? roomUsers[r.roomId].map(u => u.username) : []
    }));
    res.json({ rooms: roomsData });
  } catch (err) { res.status(500).json({ message: 'Error fetching status' }); }
});

app.get('/api/rooms', async (req, res) => {
  try { const rooms = await Room.find(); res.json({ rooms: rooms.map(r => r.roomId) }); } 
  catch (err) { res.status(500).json({ message: 'Error fetching rooms' }); }
});

// ========== Remote Control APIs ==========
app.post('/api/remote-control/request', async (req, res) => {
  const { controllerId, targetId, roomId } = req.body;
  try {
    const existing = await RemoteControl.findOne({ controllerId, targetId, status: { $in: ['pending', 'approved', 'active'] } });
    if (existing) return res.status(400).json({ message: 'សំណើរកំពុងដំណើរការរួចហើយ!' });
    const request = await RemoteControl.create({ controllerId, targetId, roomId, status: 'pending' });
    io.to(roomId).emit('remote-control-request', { requestId: request._id, controllerId, targetId, roomId });
    res.json({ success: true, requestId: request._id });
  } catch (err) { res.status(500).json({ message: 'Error requesting remote control' }); }
});

app.post('/api/remote-control/approve', async (req, res) => {
  const { requestId } = req.body;
  try {
    const request = await RemoteControl.findByIdAndUpdate(requestId, { status: 'approved' }, { new: true });
    if (!request) return res.status(404).json({ message: 'សំណើរមិនមានទេ!' });
    io.to(request.roomId).emit('remote-control-approved', { requestId: request._id, controllerId: request.controllerId, targetId: request.targetId });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: 'Error approving remote control' }); }
});

app.post('/api/remote-control/reject', async (req, res) => {
  const { requestId } = req.body;
  try {
    const request = await RemoteControl.findByIdAndUpdate(requestId, { status: 'rejected' }, { new: true });
    if (!request) return res.status(404).json({ message: 'សំណើរមិនមានទេ!' });
    io.to(request.roomId).emit('remote-control-rejected', { requestId: request._id, controllerId: request.controllerId, targetId: request.targetId });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: 'Error rejecting remote control' }); }
});

app.post('/api/remote-control/end', async (req, res) => {
  const { controllerId, targetId } = req.body;
  try {
    const request = await RemoteControl.findOneAndUpdate(
      { controllerId, targetId, status: { $in: ['approved', 'active'] } },
      { status: 'ended' },
      { new: true }
    );
    if (request) {
      io.to(request.roomId).emit('remote-control-ended', { controllerId, targetId });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: 'Error ending remote control' }); }
});

// ========== Socket.io Logic ==========
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('register-admin', () => {
    socket.join('admin-room');
  });

  socket.on('join-room', (data, peerIdArg, usernameArg) => {
    let roomId, peerId, username;

    if (typeof data === 'object' && data !== null) {
      roomId = data.roomId;
      peerId = data.peerId;
      username = data.username;
    } else {
      roomId = data;
      peerId = peerIdArg;
      username = usernameArg;
    }

    if (!roomId || !peerId) return;

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.peerId = peerId;
    socket.data.username = username;

    activeSockets.set(socket.id, { username, roomId });

    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    roomUsers[roomId] = roomUsers[roomId].filter(u => u.peerId !== peerId && u.username !== username);

    const existingUsers = [...roomUsers[roomId]];
    roomUsers[roomId].push({ socketId: socket.id, peerId, username });

    socket.emit('room-joined', { roomId, existingUsers });
    socket.emit('existing-users', existingUsers);
    
    socket.to(roomId).emit('user-joined', { peerId, username });
    io.to(roomId).emit('play-sound', 'join');
    io.emit('rooms-update');

    socket.on('disconnect', () => {
      activeSockets.delete(socket.id);
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
        socket.to(roomId).emit('user-left', { peerId: socket.data.peerId });
        socket.to(roomId).emit('user-left', socket.data.peerId);
        io.to(roomId).emit('play-sound', 'leave');
        if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
      }
      io.emit('rooms-update');
    });
  });

  socket.on('leave-room', (data) => {
    const roomId = (data && data.roomId) ? data.roomId : socket.data.roomId;
    const peerId = (data && data.peerId) ? data.peerId : socket.data.peerId;
    
    if (roomId && roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
      socket.to(roomId).emit('user-left', { peerId });
      io.to(roomId).emit('play-sound', 'leave');
      if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
    }
    socket.leave(roomId);
    io.emit('rooms-update');
  });

  const handlePrivateMessage = ({ targetPeerId, toPeerId, message, fromUsername }) => {
    const destPeerId = targetPeerId || toPeerId;
    const roomId = socket.data.roomId;
    
    if (roomId && roomUsers[roomId]) {
      const targetUser = roomUsers[roomId].find(u => u.peerId === destPeerId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('receive-private-message', {
          fromPeerId: socket.data.peerId,
          fromUsername: fromUsername || socket.data.username,
          message
        });
      }
    }
  };

  socket.on('send-private-message', handlePrivateMessage);
  socket.on('private-message', handlePrivateMessage);

  socket.on('remote-mouse-move', ({ targetId, x, y }) => {
    const roomId = socket.data.roomId;
    if (roomId && roomUsers[roomId]) {
      const targetUser = roomUsers[roomId].find(u => u.peerId === targetId);
      if (targetUser) socket.to(targetUser.socketId).emit('remote-mouse-move', { x, y });
    }
  });

  socket.on('remote-mouse-click', ({ targetId, x, y }) => {
    const roomId = socket.data.roomId;
    if (roomId && roomUsers[roomId]) {
      const targetUser = roomUsers[roomId].find(u => u.peerId === targetId);
      if (targetUser) socket.to(targetUser.socketId).emit('remote-mouse-click', { x, y });
    }
  });

  socket.on('remote-keyboard', ({ targetId, key }) => {
    const roomId = socket.data.roomId;
    if (roomId && roomUsers[roomId]) {
      const targetUser = roomUsers[roomId].find(u => u.peerId === targetId);
      if (targetUser) socket.to(targetUser.socketId).emit('remote-keyboard', { key });
    }
  });
});

// Keep-alive
setInterval(() => {
  const https = require('https');
  const hostname = process.env.RENDER_EXTERNAL_HOSTNAME || 'meeting-mu6x.onrender.com';
  https.get(`https://${hostname}/ping`, () => {}).on('error', () => {});
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
