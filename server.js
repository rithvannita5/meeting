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

// ============================================================
// SOCKET.IO CONFIG
// ============================================================
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['polling', 'websocket'],
  path: '/socket.io'
});

// ========== Base Routes ==========
app.get('/ping', (req, res) => res.send('pong'));

// ========== MongoDB Atlas Config ==========
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI environment variable not set!');
}

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

const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas!');
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      await User.create({ username: 'admin', password: '123', role: 'admin', assignedRoom: 'all', isBlocked: false });
      console.log('✅ Created default admin user');
    }
    const defaultRoom1 = await Room.findOne({ roomId: 'room-1' });
    if (!defaultRoom1) await Room.create({ roomId: 'room-1' });
    const defaultRoom2 = await Room.findOne({ roomId: 'room-2' });
    if (!defaultRoom2) await Room.create({ roomId: 'room-2' });
    console.log('✅ Default rooms ready');
  })
  .catch(err => console.error('❌ MongoDB Error:', err));

const roomUsers = {};
const activeSockets = new Map();
const otpStore = {};

// ============================================================
// ✅ NEW: REMOTE CONTROL STATE
// ============================================================
// peerId -> socketId, kept up to date on join-room/leave-room/disconnect,
// so we can find "where do I send this event" for any peerId in O(1)
// regardless of which room they're in.
const peerSocketMap = new Map();

// requestId -> { controllerId, controllerSocketId, targetId, targetSocketId, roomId, createdAt }
// A pending request that hasn't been approved/rejected yet.
const pendingRemoteRequests = new Map();
const REMOTE_REQUEST_TTL_MS = 30000; // auto-expire an unanswered request after 30s

// requestId -> { controllerId, targetId } — sessions that ARE currently
// approved/active, so we can notify both sides cleanly if either
// disconnects mid-session.
const activeRemoteSessions = new Map();

function endRemoteSession(requestId, reason) {
  const session = activeRemoteSessions.get(requestId);
  if (!session) return;
  const { controllerId, targetId } = session;
  const controllerSocketId = peerSocketMap.get(controllerId);
  const targetSocketId = peerSocketMap.get(targetId);
  const payload = { controllerId, targetId, reason: reason || 'ended' };
  if (controllerSocketId) io.to(controllerSocketId).emit('remote-control-ended', payload);
  if (targetSocketId) io.to(targetSocketId).emit('remote-control-ended', payload);
  activeRemoteSessions.delete(requestId);
}

// ========== REST APIs ==========
app.post('/api/login', async (req, res) => {
  const { username, password, roomId } = req.body;
  try {
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ success: false, message: 'ឈ្មោះ ឬលេខសម្ងាត់មិនត្រឹមត្រូវ!' });
    if (user.isBlocked) return res.status(403).json({ success: false, message: 'គណនីត្រូវបានផ្អាក!' });

    const isAdminOrSupervisor = user.role === 'admin' || user.role === 'supervisor';
    if (!isAdminOrSupervisor && user.assignedRoom !== roomId) {
      return res.status(403).json({ success: false, message: `អ្នកគ្មានសិទ្ធិចូលបន្ទប់ ${roomId} ទេ!` });
    }

    let onlineSockets = [];
    for (let [sId, data] of activeSockets.entries()) {
      if (data.username === username) {
        if (io.sockets.sockets.has(sId)) {
          onlineSockets.push(sId);
        } else {
          activeSockets.delete(sId);
        }
      }
    }

    if (onlineSockets.length > 0) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore[username] = otp;
      onlineSockets.forEach(sId => io.to(sId).emit('receive-otp', { otp }));
      return res.json({ success: false, requires2FA: true, message: 'គណនីរបស់អ្នកកំពុង Online នៅឧបករណ៍ផ្សេង។ សូមបញ្ចូលលេខកូដ 2FA!' });
    }

    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role, assignedRoom: user.assignedRoom } });
  } catch (err) { 
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' }); 
  }
});

app.post('/api/verify-2fa', async (req, res) => {
  const { username, password, otp } = req.body;
  try {
    if (otpStore[username] && otpStore[username] === otp) {
      delete otpStore[username];
      const user = await User.findOne({ username, password });
      if (!user) return res.status(401).json({ success: false, message: 'User មិនមានទេ!' });
      res.json({ success: true, user: { id: user._id, username: user.username, role: user.role, assignedRoom: user.assignedRoom } });
    } else {
      res.status(401).json({ success: false, message: '❌ លេខកូដ 2FA មិនត្រឹមត្រូវទេ!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/change-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  try {
    const user = await User.findOne({ username, password: oldPassword });
    if (!user) return res.status(401).json({ success: false, message: '❌ លេខសម្ងាត់ចាស់មិនត្រឹមត្រូវទេ!' });
    user.password = newPassword; 
    await user.save();
    res.json({ success: true, message: '✅ ប្តូរលេខសម្ងាត់បានជោគជ័យ!' });
  } catch (err) { 
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Server error' }); 
  }
});

app.get('/api/users', async (req, res) => {
  try { 
    const users = await User.find({}, '-password'); 
    res.json({ users: users.map(u => ({ id: u._id, username: u.username, role: u.role, assignedRoom: u.assignedRoom, isBlocked: u.isBlocked })) }); 
  } catch (err) { 
    console.error('Get users error:', err);
    res.status(500).json({ message: 'Error fetching users' }); 
  }
});

app.post('/api/create-user', async (req, res) => {
  const { username, password, assignedRoom, role } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'សូមបំពេញព័ត៌មានឱ្យគ្រប់!' });
  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: 'ឈ្មោះ User នេះមានរួចហើយ!' });
    await User.create({ username, password, assignedRoom: assignedRoom || 'room-1', role: role || 'user' });
    res.json({ success: true, message: 'បង្កើត User ជោគជ័យ!' });
  } catch (err) { 
    console.error('Create user error:', err);
    res.status(500).json({ message: 'Error creating user' }); 
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user && (user.role === 'admin' || user.role === 'supervisor')) {
      return res.status(400).json({ message: 'មិនអាចលុប Admin ឬ Supervisor បានទេ!' });
    }
    await User.findByIdAndDelete(req.params.id); 
    res.json({ success: true, message: 'លុប User រួចរាល់!' });
  } catch (err) { 
    console.error('Delete user error:', err);
    res.status(500).json({ message: 'Error deleting user' }); 
  }
});

app.put('/api/users/:id/reset-password', async (req, res) => {
  try { 
    const user = await User.findById(req.params.id);
    if (user && user.role === 'admin') {
      return res.status(400).json({ message: 'មិនអាចប្តូរលេខសម្ងាត់ Admin បានទេ!' });
    }
    if (!req.body.newPassword || req.body.newPassword.length < 4) {
      return res.status(400).json({ message: 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៤ តួ!' });
    }
    await User.findByIdAndUpdate(req.params.id, { password: req.body.newPassword }); 
    res.json({ success: true, message: 'ប្តូរ Password ជោគជ័យ!' }); 
  } catch (err) { 
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Error updating password' }); 
  }
});

app.put('/api/users/:id/toggle-block', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'មិនឃើញ User នេះទេ!' });
    if (user.role === 'admin' || user.role === 'supervisor') {
      return res.status(400).json({ message: 'មិនអាច Block Admin ឬ Supervisor បានទេ!' });
    }
    user.isBlocked = !user.isBlocked; 
    await user.save(); 
    res.json({ success: true, message: 'ប្តូរស្ថានភាពរួចរាល់!' });
  } catch (err) { 
    console.error('Toggle block error:', err);
    res.status(500).json({ message: 'Error updating status' }); 
  }
});

app.post('/api/create-room', async (req, res) => {
  const roomId = req.body.roomId;
  if (!roomId) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះបន្ទប់!' });
  try {
    const exists = await Room.findOne({ roomId });
    if (exists) return res.status(400).json({ message: 'បន្ទប់នេះមានរួចហើយ!' });
    await Room.create({ roomId }); 
    res.json({ success: true, message: 'បង្កើតបន្ទប់ជោគជ័យ!' });
  } catch (err) { 
    console.error('Create room error:', err);
    res.status(500).json({ message: 'Error creating room' }); 
  }
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
  } catch (err) { 
    console.error('Rooms status error:', err);
    res.status(500).json({ message: 'Error fetching status' }); 
  }
});

app.get('/api/rooms', async (req, res) => {
  try { 
    const rooms = await Room.find(); 
    res.json({ rooms: rooms.map(r => r.roomId) }); 
  } catch (err) { 
    console.error('Get rooms error:', err);
    res.status(500).json({ message: 'Error fetching rooms' }); 
  }
});

// ============================================================
// ✅ NEW: REMOTE CONTROL REST APIs
// ============================================================
// These three endpoints were being called by the client already, but
// never existed on the server — that's why "Remote Control" never worked.

app.post('/api/remote-control/request', (req, res) => {
  const { controllerId, targetId, roomId } = req.body;

  if (!controllerId || !targetId || !roomId) {
    return res.status(400).json({ success: false, message: 'ព័ត៌មានមិនគ្រប់គ្រាន់!' });
  }
  if (controllerId === targetId) {
    return res.status(400).json({ success: false, message: 'មិនអាចស្នើសុំបញ្ជាខ្លួនឯងបានទេ!' });
  }
  if (!roomUsers[roomId]) {
    return res.status(404).json({ success: false, message: 'រកមិនឃើញបន្ទប់នេះទេ!' });
  }

  const targetUser = roomUsers[roomId].find(u => u.peerId === targetId);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'អ្នកប្រើគោលដៅមិននៅក្នុងបន្ទប់នេះទេ (ប្រហែលបានចាកចេញ)!' });
  }
  const controllerUser = roomUsers[roomId].find(u => u.peerId === controllerId);

  const requestId = 'rc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  pendingRemoteRequests.set(requestId, {
    controllerId,
    controllerSocketId: controllerUser ? controllerUser.socketId : peerSocketMap.get(controllerId),
    targetId,
    targetSocketId: targetUser.socketId,
    roomId,
    createdAt: Date.now()
  });

  // Auto-expire if nobody answers, so it doesn't leak memory / stay "pending" forever.
  setTimeout(() => {
    if (pendingRemoteRequests.has(requestId)) {
      pendingRemoteRequests.delete(requestId);
      console.log(`⏱️ Remote control request ${requestId} expired (no response)`);
    }
  }, REMOTE_REQUEST_TTL_MS);

  io.to(targetUser.socketId).emit('remote-control-request', { requestId, controllerId, targetId });
  console.log(`📡 Remote control request sent: ${controllerId} -> ${targetId} (${requestId})`);

  res.json({ success: true, requestId });
});

app.post('/api/remote-control/approve', (req, res) => {
  const { requestId, targetId } = req.body;
  const reqData = pendingRemoteRequests.get(requestId);

  if (!reqData) {
    return res.status(404).json({ success: false, message: 'សំណើរនេះផុតកំណត់ ឬមិនមានទេ!' });
  }
  if (reqData.targetId !== targetId) {
    return res.status(403).json({ success: false, message: 'អ្នកគ្មានសិទ្ធិអនុញ្ញាតសំណើរនេះទេ!' });
  }

  pendingRemoteRequests.delete(requestId);
  activeRemoteSessions.set(requestId, { controllerId: reqData.controllerId, targetId: reqData.targetId });

  const controllerSocketId = peerSocketMap.get(reqData.controllerId) || reqData.controllerSocketId;
  if (controllerSocketId) {
    io.to(controllerSocketId).emit('remote-control-approved', {
      controllerId: reqData.controllerId,
      targetId: reqData.targetId,
      requestId
    });
  }
  console.log(`✅ Remote control approved: ${reqData.controllerId} -> ${reqData.targetId} (${requestId})`);

  res.json({ success: true });
});

app.post('/api/remote-control/reject', (req, res) => {
  const { requestId } = req.body;
  const reqData = pendingRemoteRequests.get(requestId);

  if (!reqData) {
    return res.status(404).json({ success: false, message: 'សំណើរនេះផុតកំណត់ ឬមិនមានទេ!' });
  }

  pendingRemoteRequests.delete(requestId);

  const controllerSocketId = peerSocketMap.get(reqData.controllerId) || reqData.controllerSocketId;
  if (controllerSocketId) {
    io.to(controllerSocketId).emit('remote-control-rejected', {
      controllerId: reqData.controllerId,
      targetId: reqData.targetId
    });
  }
  console.log(`❌ Remote control rejected: ${reqData.controllerId} -> ${reqData.targetId} (${requestId})`);

  res.json({ success: true });
});

// ============================================================
// SOCKET.IO LOGIC
// ============================================================
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, peerId, username } = data;
    
    if (!roomId || !peerId) {
      console.log('❌ Missing roomId or peerId');
      return;
    }

    console.log(`📥 ${username} (${peerId}) joining room: ${roomId}`);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.peerId = peerId;
    socket.data.username = username;

    activeSockets.set(socket.id, { username, roomId, peerId });
    peerSocketMap.set(peerId, socket.id); // ✅ NEW: keep peerId -> socketId fresh

    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    roomUsers[roomId] = roomUsers[roomId].filter(u => u.peerId !== peerId);

    const existingUsers = [...roomUsers[roomId]];
    roomUsers[roomId].push({ socketId: socket.id, peerId, username });

    const existingUsersData = existingUsers.map(u => ({ peerId: u.peerId, username: u.username }));
    socket.emit('room-joined', { roomId, existingUsers: existingUsersData });
    
    // Send to everyone in the room (including the new user)
    socket.to(roomId).emit('user-joined', { peerId, username });
    
    // Send rooms update to everyone
    io.emit('rooms-update');
  });

  socket.on('leave-room', (data) => {
    const roomId = data?.roomId || socket.data.roomId;
    const peerId = data?.peerId || socket.data.peerId;
    
    if (roomId && roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
      socket.to(roomId).emit('user-left', { peerId });
      if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
    }
    if (peerId && peerSocketMap.get(peerId) === socket.id) {
      peerSocketMap.delete(peerId); // ✅ NEW
    }
    // ✅ NEW: cleanly end any remote-control session this peer was part of
    if (peerId) {
      activeRemoteSessions.forEach((session, reqId) => {
        if (session.controllerId === peerId || session.targetId === peerId) {
          endRemoteSession(reqId, 'peer-left');
        }
      });
    }
    socket.leave(roomId);
    activeSockets.delete(socket.id);
    io.emit('rooms-update');
  });

  socket.on('send-private-message', (data) => {
    const { targetPeerId, message, fromUsername } = data;
    const roomId = socket.data.roomId;
    
    if (roomId && roomUsers[roomId]) {
      const targetUser = roomUsers[roomId].find(u => u.peerId === targetPeerId);
      if (targetUser) {
        io.to(targetUser.socketId).emit('receive-private-message', {
          fromPeerId: socket.data.peerId,
          fromUsername: fromUsername || socket.data.username,
          message: message
        });
      }
    }
  });

  // ============================================================
  // ✅ NEW: REMOTE CONTROL — realtime relay
  // ============================================================
  // The REST endpoints above handle the request/approve/reject handshake.
  // Once approved, mouse/keyboard events are relayed here in realtime via
  // sockets (much lower latency than REST for this).

  socket.on('remote-mouse-move', (data) => {
    const targetSocketId = peerSocketMap.get(data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('remote-mouse-move', { x: data.x, y: data.y });
    }
  });

  socket.on('remote-mouse-click', (data) => {
    const targetSocketId = peerSocketMap.get(data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('remote-mouse-click', { x: data.x, y: data.y });
    }
  });

  socket.on('remote-keyboard', (data) => {
    const targetSocketId = peerSocketMap.get(data.targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('remote-keyboard', { key: data.key });
    }
  });

  // Either side (the controller stopping, or the target revoking access)
  // can end an active session.
  socket.on('remote-control-end', (data) => {
    const { controllerId, targetId } = data || {};
    if (!controllerId || !targetId) return;

    // find + clear the matching active session (if tracked)
    let matchedReqId = null;
    activeRemoteSessions.forEach((session, reqId) => {
      if (session.controllerId === controllerId && session.targetId === targetId) {
        matchedReqId = reqId;
      }
    });
    if (matchedReqId) {
      endRemoteSession(matchedReqId, 'manual-end');
    } else {
      // No tracked session (e.g. state drifted) — still notify both sides directly.
      const controllerSocketId = peerSocketMap.get(controllerId);
      const targetSocketId = peerSocketMap.get(targetId);
      const payload = { controllerId, targetId, reason: 'manual-end' };
      if (controllerSocketId) io.to(controllerSocketId).emit('remote-control-ended', payload);
      if (targetSocketId) io.to(targetSocketId).emit('remote-control-ended', payload);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
    activeSockets.delete(socket.id);
    
    const roomId = socket.data.roomId;
    const peerId = socket.data.peerId;
    
    if (roomId && roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
      if (peerId) {
        socket.to(roomId).emit('user-left', { peerId });
      }
      if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
    }

    if (peerId) {
      if (peerSocketMap.get(peerId) === socket.id) {
        peerSocketMap.delete(peerId); // ✅ NEW
      }
      // ✅ NEW: cleanly end any remote-control session this peer was part of
      activeRemoteSessions.forEach((session, reqId) => {
        if (session.controllerId === peerId || session.targetId === peerId) {
          endRemoteSession(reqId, 'peer-disconnected');
        }
      });
      // also drop any pending (not-yet-approved) requests involving this peer
      pendingRemoteRequests.forEach((reqData, reqId) => {
        if (reqData.controllerId === peerId || reqData.targetId === peerId) {
          pendingRemoteRequests.delete(reqId);
        }
      });
    }

    io.emit('rooms-update');
  });
});

// Keep-alive for Render
setInterval(() => {
  try {
    const hostname = process.env.RENDER_EXTERNAL_HOSTNAME || 'meeting-mu6x.onrender.com';
    fetch(`https://${hostname}/ping`).catch(() => {});
  } catch (e) {}
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
