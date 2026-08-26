const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// តំណភ្ជាប់ MongoDB Atlas របស់អ្នក
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://rithvannita5_db_user:81Aokzd93Q9Vu3Xb@cluster0.oaj62a4.mongodb.net/meetingDB?retryWrites=true&w=majority&appName=Cluster0";

// MongoDB Schemas & Models
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

// ភ្ជាប់ទៅកាន់ MongoDB Atlas
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas Successfully!');
    
    // បង្កើត Admin លំនាំដើមបើមិនទាន់មានក្នុង Database
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      await User.create({ 
        username: 'admin', 
        password: '123', 
        role: 'admin', 
        assignedRoom: 'all', 
        isBlocked: false 
      });
      console.log('👑 Default Admin created: admin / 123');
    }

    // បង្កើតបន្ទប់លំនាំដើម room-1 និង room-2 បើមិនទាន់មាន
    const defaultRoom1 = await Room.findOne({ roomId: 'room-1' });
    if (!defaultRoom1) await Room.create({ roomId: 'room-1' });
    
    const defaultRoom2 = await Room.findOne({ roomId: 'room-2' });
    if (!defaultRoom2) await Room.create({ roomId: 'room-2' });
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const roomUsers = {};

// API Login
app.post('/api/login', async (req, res) => {
  const { username, password, roomId } = req.body;
  try {
    const user = await User.findOne({ username, password });
    
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
        id: user._id, 
        username: user.username, 
        role: user.role, 
        assignedRoom: user.assignedRoom 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API ទាញយកបញ្ជី User ទាំងអស់សម្រាប់ Admin
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json({ 
      users: users.map(u => ({ 
        id: u._id, 
        username: u.username, 
        role: u.role, 
        assignedRoom: u.assignedRoom, 
        isBlocked: u.isBlocked 
      })) 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// API បង្កើត User ថ្មី
app.post('/api/create-user', async (req, res) => {
  const { username, password, assignedRoom } = req.body;
  if (!username || !password || !assignedRoom) {
    return res.status(400).json({ message: 'សូមបំពេញព័ត៌មានឱ្យគ្រប់!' });
  }
  
  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: 'ឈ្មោះ User នេះមានរួចហើយ!' });

    await User.create({ username, password, assignedRoom });
    res.json({ success: true, message: `បង្កើត User ជោគជ័យ សម្រាប់បន្ទប់ ${assignedRoom}!` });
  } catch (err) {
    res.status(500).json({ message: 'Error creating user' });
  }
});

// API លុប User
app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user && user.role === 'admin') {
      return res.status(400).json({ message: 'មិនអាចលុបគណនី Admin បានទេ!' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'លុប User រួចរាល់!' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// API Reset Password
app.put('/api/users/:id/reset-password', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { password: req.body.newPassword });
    if (!user) return res.status(404).json({ message: 'រកមិនឃើញ User ទេ!' });
    res.json({ success: true, message: `ប្តូរ Password របស់ ${user.username} ជោគជ័យ!` });
  } catch (err) {
    res.status(500).json({ message: 'Error updating password' });
  }
});

// API Block / Unblock User
app.put('/api/users/:id/toggle-block', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'រកមិនឃើញ User ទេ!' });
    if (user.role === 'admin') return res.status(400).json({ message: 'មិនអាច Block Admin បានទេ!' });
    
    user.isBlocked = !user.isBlocked;
    await user.save();
    
    res.json({ 
      success: true, 
      message: `${user.isBlocked ? 'បានផ្អាក (Blocked)' : 'បានបើកដំណើរការ (Unblocked)'} ${user.username} រួចរាល់!` 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating block status' });
  }
});

// API កែប្រែបន្ទប់
app.put('/api/users/:id/edit-room', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { assignedRoom: req.body.newRoom });
    if (!user) return res.status(404).json({ message: 'រកមិនឃើញ User ទេ!' });
    res.json({ success: true, message: `បានប្តូរបន្ទប់របស់ ${user.username} ទៅ ${req.body.newRoom} រួចរាល់!` });
  } catch (err) {
    res.status(500).json({ message: 'Error updating room' });
  }
});

// API បង្កើតបន្ទប់ថ្មី
app.post('/api/create-room', async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះបន្ទប់!' });
  
  try {
    const exists = await Room.findOne({ roomId });
    if (exists) return res.status(400).json({ message: 'បន្ទប់នេះមានរួចហើយ!' });
    
    await Room.create({ roomId });
    const rooms = await Room.find();
    res.json({ success: true, message: 'បង្កើតបន្ទប់ជោគជ័យ!', rooms: rooms.map(r => r.roomId) });
  } catch (err) {
    res.status(500).json({ message: 'Error creating room' });
  }
});

// API យកបន្ទប់សកម្ម
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
    res.status(500).json({ message: 'Error fetching rooms status' });
  }
});

// API យកបញ្ជីបន្ទប់សាមញ្ញ
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await Room.find();
    res.json({ rooms: rooms.map(r => r.roomId) });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching rooms' });
  }
});

// Socket.io
io.on('connection', (socket) => {
  socket.on('join-room', (roomId, peerId, username) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.peerId = peerId;
    socket.data.username = username;
    
    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    const existing = roomUsers[roomId].find(u => u.peerId === peerId);
    if (!existing) roomUsers[roomId].push({ socketId: socket.id, peerId, username });

    const allUsers = roomUsers[roomId].filter(u => u.peerId !== peerId);
    socket.emit('all-users', allUsers);
    socket.to(roomId).emit('user-joined', { peerId, username });

    socket.on('disconnect', () => {
      if (roomUsers[roomId]) {
        roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
        socket.to(roomId).emit('user-left', socket.data.peerId);
        if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
