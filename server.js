const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

const io = new Server(server, { cors: { origin: "*" }, transports: ['websocket', 'polling'] });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://rithvannita5_db_user:81Aokzd93Q9Vu3Xb@cluster0.oaj62a4.mongodb.net/meetingDB?retryWrites=true&w=majority&appName=Cluster0";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'member' },
  assignedRoom: { type: String, default: 'room-1' },
  isBlocked: { type: Boolean, default: false }
});

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true }
});

const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas!');
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) await User.create({ username: 'admin', password: '123', role: 'admin', assignedRoom: 'all', isBlocked: false });
    const defaultRoom1 = await Room.findOne({ roomId: 'room-1' });
    if (!defaultRoom1) await Room.create({ roomId: 'room-1' });
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
    if (user.role !== 'admin' && user.assignedRoom !== roomId) return res.status(403).json({ success: false, message: `អ្នកគ្មានសិទ្ធិចូលបន្ទប់ ${roomId} ទេ!` });

    let onlineSockets = [];
    for (let [sId, data] of activeSockets.entries()) {
      if (data.username === username) onlineSockets.push(sId);
    }

    if (onlineSockets.length > 0) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore[username] = otp;
      onlineSockets.forEach(sId => io.to(sId).emit('receive-otp', { otp }));
      io.to('admin-room').emit('admin-alert', { username: username, count: onlineSockets.length + 1 });
      return res.json({ success: false, requires2FA: true, message: 'គណនីរបស់អ្នកកំពុង Online នៅឧបករណ៍ផ្សេង។ សូមបញ្ចូលលេខកូដ 2FA!' });
    }

    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role, assignedRoom: user.assignedRoom } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
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
    user.password = newPassword; await user.save(); res.json({ success: true, message: '✅ ប្តូរលេខសម្ងាត់បានជោគជ័យ!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.get('/api/users', async (req, res) => {
  try { const users = await User.find({}, '-password'); res.json({ users: users.map(u => ({ id: u._id, username: u.username, role: u.role, assignedRoom: u.assignedRoom, isBlocked: u.isBlocked })) }); } catch (err) { res.status(500).json({ message: 'Error' }); }
});
app.post('/api/create-user', async (req, res) => {
  const { username, password, assignedRoom } = req.body;
  try { const exists = await User.findOne({ username }); if (exists) return res.status(400).json({ message: 'ឈ្មោះនេះមានរួចហើយ!' }); await User.create({ username, password, assignedRoom }); res.json({ success: true, message: 'បង្កើតជោគជ័យ!' }); } catch (err) {}
});
app.delete('/api/users/:id', async (req, res) => {
  try { const user = await User.findById(req.params.id); if (user && user.role === 'admin') return res.status(400).json({ message: 'មិនអាចលុប Admin ទេ!' }); await User.findByIdAndDelete(req.params.id); res.json({ success: true, message: 'លុបរួចរាល់!' }); } catch (err) {}
});
app.put('/api/users/:id/reset-password', async (req, res) => {
  try { await User.findByIdAndUpdate(req.params.id, { password: req.body.newPassword }); res.json({ success: true, message: 'ប្តូរ Password ជោគជ័យ!' }); } catch (err) {}
});
app.put('/api/users/:id/toggle-block', async (req, res) => {
  try { const user = await User.findById(req.params.id); if (user.role === 'admin') return res.status(400).json({ message: 'មិនអាច Block Admin ទេ!' }); user.isBlocked = !user.isBlocked; await user.save(); res.json({ success: true, message: 'ប្តូរស្ថានភាពរួចរាល់!' }); } catch (err) {}
});
app.put('/api/users/:id/edit-room', async (req, res) => {
  try { await User.findByIdAndUpdate(req.params.id, { assignedRoom: req.body.newRoom }); res.json({ success: true, message: 'ប្តូរបន្ទប់រួចរាល់!' }); } catch (err) {}
});
app.post('/api/create-room', async (req, res) => {
  const { roomId } = req.body;
  try { const exists = await Room.findOne({ roomId }); if (exists) return res.status(400).json({ message: 'បន្ទប់នេះមានរួចហើយ!' }); await Room.create({ roomId }); res.json({ success: true, message: 'បង្កើតបន្ទប់ជោគជ័យ!' }); } catch (err) {}
});
app.get('/api/rooms-status', async (req, res) => {
  try { const rooms = await Room.find(); const roomsData = rooms.map(r => ({ roomId: r.roomId, userCount: roomUsers[r.roomId] ? roomUsers[r.roomId].length : 0, users: roomUsers[r.roomId] ? roomUsers[r.roomId].map(u => u.username) : [] })); res.json({ rooms: roomsData }); } catch (err) {}
});
app.get('/api/rooms', async (req, res) => {
  try { const rooms = await Room.find(); res.json({ rooms: rooms.map(r => r.roomId) }); } catch (err) {}
});

io.on('connection', (socket) => {
  socket.on('register-admin', () => {
    socket.join('admin-room');
  });

  socket.on('join-room', (roomId, peerId, username) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.peerId = peerId;
    socket.data.username = username;
    
    activeSockets.set(socket.id, { username, roomId });

    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    
    const oldSessions = roomUsers[roomId].filter(u => u.username === username && u.socketId !== socket.id);
    oldSessions.forEach(old => {
      io.to(old.socketId).emit('kicked-out', 'មានឧបករណ៍ថ្មីបាន Login ចូលគណនីរបស់អ្នក។');
    });

    roomUsers[roomId] = roomUsers[roomId].filter(u => u.username !== username);
    
    const existingUsers = [...roomUsers[roomId]];
    roomUsers[roomId].push({ socketId: socket.id, peerId, username });

    socket.emit('existing-users', existingUsers);
    socket.to(roomId).emit('user-joined', { peerId, username });

    // Broadcast ទៅ Admin ឱ្យ Update ផ្ទាំង Monitor ភ្លាមៗ
    io.to('admin-room').emit('rooms-update');

    socket.on('disconnect', () => {
      activeSockets.delete(socket.id);
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
        socket.to(roomId).emit('user-left', socket.data.peerId);
        if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
      }
      io.to('admin-room').emit('rooms-update');
    });
  });

  socket.on('private-message', ({ toPeerId, message }) => {
    const roomId = socket.data.roomId;
    if (roomUsers[roomId]) {
      const targetUser = roomUsers[roomId].find(u => u.peerId === toPeerId);
      if (targetUser) {
        socket.to(targetUser.socketId).emit('receive-private-message', {
          fromPeerId: socket.data.peerId,
          fromUsername: socket.data.username,
          message: message
        });
      }
    }
  });

  socket.on('kick-user', (targetUsername) => {
    for (let [sId, data] of activeSockets.entries()) {
      if (data.username === targetUsername) {
        io.to(sId).emit('kicked-out');
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
