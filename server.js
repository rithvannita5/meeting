const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peerjs', peerServer);

const io = new Server(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

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
    if (!await User.findOne({ username: 'admin' })) {
      await User.create({ username: 'admin', password: '123', role: 'admin', assignedRoom: 'all', isBlocked: false });
    }
    if (!await Room.findOne({ roomId: 'room-1' })) await Room.create({ roomId: 'room-1' });
    if (!await Room.findOne({ roomId: 'room-2' })) await Room.create({ roomId: 'room-2' });
  })
  .catch(err => console.error('MongoDB Error:', err));

const roomUsers = {};
const activeSockets = new Map();
const otpStore = {};

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
      return res.json({ success: false, requires2FA: true, message: 'គណនីរបស់អ្នកកំពុង Online នៅឧបករណ៍ផ្សេង។' });
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

app.post('/api/create-user', async (req, res) => {
  const { username, password, assignedRoom, role } = req.body;
  try {
    await User.create({ username, password, assignedRoom, role: role || 'user' });
    res.json({ success: true, message: 'បង្កើត User ជោគជ័យ!' });
  } catch (err) { res.status(500).json({ message: 'Error creating user' }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id); 
    res.json({ success: true, message: 'លុប User រួចរាល់!' });
  } catch (err) { res.status(500).json({ message: 'Error deleting user' }); }
});

app.put('/api/users/:id/reset-password', async (req, res) => {
  try { 
    await User.findByIdAndUpdate(req.params.id, { password: req.body.newPassword }); 
    res.json({ success: true, message: 'ប្តូរ Password ជោគជ័យ!' }); 
  } catch (err) { res.status(500).json({ message: 'Error updating password' }); }
});

app.put('/api/users/:id/toggle-block', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
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
    await User.findByIdAndUpdate(req.params.id, { role: req.body.newRole });
    res.json({ success: true, message: 'ប្តូរ Role ជោគជ័យ!' });
  } catch (err) { res.status(500).json({ message: 'Error updating role' }); }
});

app.post('/api/create-room', async (req, res) => {
  try {
    await Room.create({ roomId: req.body.roomId }); 
    res.json({ success: true, message: 'បង្កើតបន្ទប់ជោគជ័យ!' });
  } catch (err) { res.status(500).json({ message: 'Error creating room' }); }
});

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

// Remote Control APIs
app.post('/api/remote-control/request', async (req, res) => {
  const { controllerId, targetId, roomId } = req.body;
  try {
    const request = await RemoteControl.create({ controllerId, targetId, roomId, status: 'pending' });
    for (let [sId, data] of activeSockets.entries()) {
      if (roomUsers[roomId]) {
        const targetUser = roomUsers[roomId].find(u => u.peerId === targetId);
        if (targetUser) {
          io.to(targetUser.socketId).emit('remote-control-request', { requestId: request._id, controllerId });
          break;
        }
      }
    }
    res.json({ success: true, requestId: request._id });
  } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/remote-control/approve', async (req, res) => {
  const { requestId, targetId } = req.body;
  try {
    const reqDoc = await RemoteControl.findById(requestId);
    if (reqDoc) {
      reqDoc.status = 'approved';
      await reqDoc.save();
      io.emit('remote-control-approved', { controllerId: reqDoc.controllerId, targetId });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/remote-control/reject', async (req, res) => {
  const { requestId } = req.body;
  try {
    const reqDoc = await RemoteControl.findById(requestId);
    if (reqDoc) {
      reqDoc.status = 'rejected';
      await reqDoc.save();
      io.emit('remote-control-rejected', { controllerId: reqDoc.controllerId });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/remote-control/end', async (req, res) => {
  const { controllerId, targetId } = req.body;
  io.emit('remote-control-ended', { controllerId, targetId });
  res.json({ success: true });
});

io.on('connection', (socket) => {
  activeSockets.set(socket.id, { username: 'Guest' });

  socket.on('register-admin', () => socket.join('admin-room'));

  socket.on('join-room', (roomId, peerId, username) => {
    socket.join(roomId);
    activeSockets.set(socket.id, { username, roomId });

    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    roomUsers[roomId].push({ socketId: socket.id, peerId, username });

    io.to(roomId).emit('play-sound', 'join');
    socket.emit('existing-users', roomUsers[roomId].filter(u => u.peerId !== peerId));
    socket.to(roomId).emit('user-joined', { peerId, username });
    io.emit('rooms-update');
  });

  socket.on('private-message', ({ toPeerId, message }) => {
    for (let [sId, data] of activeSockets.entries()) {
      if (roomUsers[data.roomId]) {
        const targetUser = roomUsers[data.roomId].find(u => u.peerId === toPeerId);
        if (targetUser) {
          const senderData = roomUsers[data.roomId].find(u => u.socketId === socket.id);
          io.to(targetUser.socketId).emit('receive-private-message', {
            fromPeerId: senderData ? senderData.peerId : socket.id,
            fromUsername: senderData ? senderData.username : 'Unknown',
            message
          });
          break;
        }
      }
    }
  });

  socket.on('remote-mouse-move', (data) => io.emit('remote-mouse-move', data));
  socket.on('remote-mouse-click', (data) => io.emit('remote-mouse-click', data));
  socket.on('remote-keyboard', (data) => io.emit('remote-keyboard', data));
  socket.on('screen-data-fallback', (data) => socket.to(data.roomId).emit('screen-data-fallback', data));
  socket.on('stop-screen-fallback', (data) => socket.to(data.roomId).emit('stop-screen-fallback', data));

  socket.on('disconnect', () => {
    activeSockets.delete(socket.id);
    for (let roomId in roomUsers) {
      const index = roomUsers[roomId].findIndex(u => u.socketId === socket.id);
      if (index !== -1) {
        const leftUser = roomUsers[roomId][index];
        roomUsers[roomId].splice(index, 1);
        io.to(roomId).emit('user-left', leftUser.peerId);
        io.to(roomId).emit('play-sound', 'leave');
        io.emit('rooms-update');
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
