const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// PeerServer
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peerjs', peerServer);

const io = new Server(server, { 
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============== PWA Routes ==============

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

// ============== MongoDB Connection ==============

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://rithvannita5_db_user:81Aokzd93Q9Vu3Xb@cluster0.oaj62a4.mongodb.net/meetingDB?retryWrites=true&w=majority&appName=Cluster0";

// User Schema
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

// ============== API Routes ==============

// Login
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
      return res.json({ success: false, requires2FA: true, message: 'គណនីរបស់អ្នកកំពុង Online នៅឧបករណ៍ផ្សេង។ សូមបញ្ចូលលេខកូដ 2FA ដែលបានផ្ញើទៅឧបករណ៍នោះ!' });
    }

    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role, assignedRoom: user.assignedRoom } });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// Verify 2FA
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

// Change Password
app.post('/api/change-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  try {
    const user = await User.findOne({ username, password: oldPassword });
    if (!user) return res.status(401).json({ success: false, message: '❌ លេខសម្ងាត់ចាស់មិនត្រឹមត្រូវទេ!' });
    user.password = newPassword; await user.save();
    res.json({ success: true, message: '✅ ប្តូរលេខសម្ងាត់បានជោគជ័យ!' });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ============== Admin & Supervisor APIs ==============

// Get Users
app.get('/api/users', async (req, res) => {
  try { 
    const users = await User.find({}, '-password'); 
    res.json({ users: users.map(u => ({ id: u._id, username: u.username, role: u.role, assignedRoom: u.assignedRoom, isBlocked: u.isBlocked })) }); 
  } 
  catch (err) { res.status(500).json({ message: 'Error fetching users' }); }
});

// Create User - Admin only
app.post('/api/create-user', async (req, res) => {
  const { username, password, assignedRoom, role } = req.body;
  if (!username || !password || !assignedRoom) return res.status(400).json({ message: 'សូមបំពេញព័ត៌មានឱ្យគ្រប់!' });
  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: 'ឈ្មោះ User នេះមានរួចហើយ!' });
    
    const userRole = role || 'user';
    await User.create({ username, password, assignedRoom, role: userRole });
    res.json({ success: true, message: 'បង្កើត User ជោគជ័យ!' });
  } catch (err) { res.status(500).json({ message: 'Error creating user' }); }
});

// Delete User - Admin only
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

// Reset Password
app.put('/api/users/:id/reset-password', async (req, res) => {
  try { 
    const user = await User.findById(req.params.id);
    if (user && user.role === 'admin') {
      return res.status(400).json({ message: 'មិនអាចប្តូរលេខសម្ងាត់ Admin បានទេ!' });
    }
    await User.findByIdAndUpdate(req.params.id, { password: req.body.newPassword }); 
    res.json({ success: true, message: 'ប្តូរ Password ជោគជ័យ!' }); 
  } 
  catch (err) { res.status(500).json({ message: 'Error updating password' }); }
});

// Toggle Block
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

// Edit Room
app.put('/api/users/:id/edit-room', async (req, res) => {
  try { 
    await User.findByIdAndUpdate(req.params.id, { assignedRoom: req.body.newRoom }); 
    res.json({ success: true, message: 'ប្តូរបន្ទប់រួចរាល់!' }); 
  } 
  catch (err) { res.status(500).json({ message: 'Error updating room' }); }
});

// Edit User Role - Admin only
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

// Create Room - Admin only
app.post('/api/create-room', async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះបន្ទប់!' });
  try {
    const exists = await Room.findOne({ roomId });
    if (exists) return res.status(400).json({ message: 'បន្ទប់នេះមានរួចហើយ!' });
    await Room.create({ roomId }); 
    res.json({ success: true, message: 'បង្កើតបន្ទប់ជោគជ័យ!' });
  } catch (err) { res.status(500).json({ message: 'Error creating room' }); }
});

// Get Rooms Status
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

// Get Rooms
app.get('/api/rooms', async (req, res) => {
  try { const rooms = await Room.find(); res.json({ rooms: rooms.map(r => r.roomId) }); } 
  catch (err) { res.status(500).json({ message: 'Error fetching rooms' }); }
});

// ============== Remote Control APIs ==============

// Request Remote Control
app.post('/api/remote-control/request', async (req, res) => {
  const { controllerId, targetId, roomId } = req.body;
  try {
    const existing = await RemoteControl.findOne({ controllerId, targetId, status: { $in: ['pending', 'approved', 'active'] } });
    if (existing) {
      return res.status(400).json({ message: 'សំណើរកំពុងដំណើរការរួចហើយ!' });
    }
    
    const request = await RemoteControl.create({ controllerId, targetId, roomId, status: 'pending' });
    
    io
