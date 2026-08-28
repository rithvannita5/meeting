const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// FALLBACK USERS (ប្រើពេល MongoDB មិនភ្ជាប់)
// ============================================================
const FALLBACK_USERS = {
  'admin': { password: 'admin123', role: 'admin', assignedRoom: 'room-1' },
  'supervisor': { password: 'user123', role: 'supervisor', assignedRoom: 'room-1' },
  'rith': { password: 'user123', role: 'user', assignedRoom: 'room-1' },
  'sokha': { password: 'user123', role: 'user', assignedRoom: 'room-1' },
  'dara': { password: 'user123', role: 'user', assignedRoom: 'room-1' }
};

// ============================================================
// MONGODB SCHEMA
// ============================================================
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'supervisor', 'user'], default: 'user' },
  assignedRoom: { type: String, default: 'room-1' },
  isBlocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true, required: true },
  users: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);

// ============================================================
// CONNECT TO MONGODB - FIXED: Use MONGO_URI
// ============================================================
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log('🔌 Connecting to MongoDB...');
console.log('📌 Using URI:', MONGODB_URI ? '✅ Connection string is set' : '❌ NOT SET!');

if (!MONGODB_URI) {
  console.log('⚠️ No MongoDB URI found! Using fallback users only.');
  console.log('🔑 Default users: admin/admin123, supervisor/user123, rith/user123');
} else {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000
  })
  .then(() => {
    console.log('✅ Connected to MongoDB successfully!');
    initializeData();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️ Server will continue with fallback users only.');
  });
}

// ============================================================
// INITIALIZE DATA
// ============================================================
async function initializeData() {
  try {
    // Create default rooms
    const defaultRooms = ['room-1', 'room-2', 'room-3', 'room-4', 'room-5'];
    for (const roomId of defaultRooms) {
      const existing = await Room.findOne({ roomId });
      if (!existing) {
        await Room.create({ roomId, users: [] });
        console.log(`✅ Room "${roomId}" created`);
      }
    }
    
    // Create default users from fallback
    for (const [username, data] of Object.entries(FALLBACK_USERS)) {
      const exists = await User.findOne({ username });
      if (!exists) {
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(data.password, salt);
        await User.create({
          username,
          password: hashedPassword,
          role: data.role,
          assignedRoom: data.assignedRoom
        });
        console.log(`✅ User "${username}" created`);
      }
    }
    
    console.log('✅ Data initialization completed!');
  } catch (err) {
    console.error('Error initializing data:', err);
  }
}

// ============================================================
// API ROUTES
// ============================================================

// Get all rooms
app.get('/api/rooms', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const rooms = await Room.find({}, 'roomId');
      res.json({ rooms: rooms.map(r => r.roomId) });
    } else {
      res.json({ rooms: ['room-1', 'room-2', 'room-3', 'room-4', 'room-5'] });
    }
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.json({ rooms: ['room-1', 'room-2', 'room-3', 'room-4', 'room-5'] });
  }
});

// Get rooms status
app.get('/api/rooms-status', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const rooms = await Room.find();
      const roomStatus = rooms.map(room => ({
        roomId: room.roomId,
        userCount: room.users.length,
        users: room.users
      }));
      res.json({ rooms: roomStatus });
    } else {
      res.json({ rooms: [] });
    }
  } catch (err) {
    console.error('Error fetching room status:', err);
    res.json({ rooms: [] });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const users = await User.find({}, '-password');
      res.json({ users });
    } else {
      res.json({ users: [] });
    }
  } catch (err) {
    console.error('Error fetching users:', err);
    res.json({ users: [] });
  }
});

// Login - with fallback support
app.post('/api/login', async (req, res) => {
  console.log('🔐 Login attempt:', req.body.username);
  
  try {
    const { username, password, roomId } = req.body;
    
    if (!username || !password) {
      return res.json({ success: false, message: 'សូមបំពេញ Username និង Password!' });
    }
    
    // ✅ FALLBACK USERS (ប្រើពេល MongoDB មិនភ្ជាប់ ឬគ្មាន User)
    const FALLBACK_USERS = {
      'admin': { password: 'admin123', role: 'admin', assignedRoom: 'room-1' },
      'supervisor': { password: 'user123', role: 'supervisor', assignedRoom: 'room-1' },
      'rith': { password: 'user123', role: 'user', assignedRoom: 'room-1' },
      'sokha': { password: 'user123', role: 'user', assignedRoom: 'room-1' },
      'dara': { password: 'user123', role: 'user', assignedRoom: 'room-1' }
    };
    
    // ✅ ពិនិត្យ Fallback មុន
    const fallbackUser = FALLBACK_USERS[username];
    if (fallbackUser && fallbackUser.password === password) {
      console.log('✅ Login successful (fallback):', username);
      return res.json({
        success: true,
        user: {
          username: username,
          role: fallbackUser.role,
          assignedRoom: fallbackUser.assignedRoom
        }
      });
    }
    
    // ✅ ប្រសិនបើ MongoDB ភ្ជាប់ សាកល្បង Login ជាមួយ Database
    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ username });
      if (user) {
        const isValidPassword = bcrypt.compareSync(password, user.password);
        if (isValidPassword && !user.isBlocked) {
          console.log('✅ Login successful (MongoDB):', username);
          return res.json({
            success: true,
            user: {
              id: user._id,
              username: user.username,
              role: user.role,
              assignedRoom: user.assignedRoom
            }
          });
        }
      }
    }
    
    // ❌ ប្រសិនបើ Fallback និង MongoDB មិនជោគជ័យ
    return res.json({ success: false, message: 'Username ឬ Password មិនត្រឹមត្រូវ!' });
    
  } catch (err) {
    console.error('Login error:', err);
    res.json({ success: false, message: 'មានបញ្ហាក្នុងការ Login!' });
  }
});

// Create user
app.post('/api/create-user', async (req, res) => {
  try {
    const { username, password, assignedRoom, role } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, message: 'MongoDB មិនទាន់ភ្ជាប់ទេ!' });
    }
    
    const existing = await User.findOne({ username });
    if (existing) {
      return res.json({ success: false, message: 'Username មានរួចហើយ!' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    
    await User.create({
      username,
      password: hashedPassword,
      role: role || 'user',
      assignedRoom: assignedRoom || 'room-1'
    });
    
    res.json({ success: true, message: 'User ត្រូវបានបង្កើតដោយជោគជ័យ!' });
  } catch (err) {
    console.error('Create user error:', err);
    res.json({ success: false, message: 'មានបញ្ហាក្នុងការបង្កើត User!' });
  }
});

// Create room
app.post('/api/create-room', async (req, res) => {
  try {
    const { roomId } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, message: 'MongoDB មិនទាន់ភ្ជាប់ទេ!' });
    }
    
    const existing = await Room.findOne({ roomId });
    if (existing) {
      return res.json({ success: false, message: 'បន្ទប់មានរួចហើយ!' });
    }
    
    await Room.create({ roomId, users: [] });
    res.json({ success: true, message: 'បន្ទប់ត្រូវបានបង្កើតដោយជោគជ័យ!' });
  } catch (err) {
    console.error('Create room error:', err);
    res.json({ success: false, message: 'មានបញ្ហាក្នុងការបង្កើតបន្ទប់!' });
  }
});

// Toggle block user
app.put('/api/users/:id/toggle-block', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'MongoDB មិនទាន់ភ្ជាប់ទេ!' });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User មិនមាន!' });
    }
    user.isBlocked = !user.isBlocked;
    await user.save();
    res.json({ success: true, message: `User ${user.isBlocked ? 'Blocked' : 'Unblocked'}!` });
  } catch (err) {
    console.error('Toggle block error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'MongoDB មិនទាន់ភ្ជាប់ទេ!' });
    }
    
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User ត្រូវបានលុប!' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reset password
app.put('/api/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'MongoDB មិនទាន់ភ្ជាប់ទេ!' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);
    
    await User.findByIdAndUpdate(req.params.id, { password: hashedPassword });
    res.json({ success: true, message: 'Password ត្រូវបានប្តូរដោយជោគជ័យ!' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Edit user room
app.put('/api/users/:id/edit-room', async (req, res) => {
  try {
    const { newRoom } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'MongoDB មិនទាន់ភ្ជាប់ទេ!' });
    }
    
    await User.findByIdAndUpdate(req.params.id, { assignedRoom: newRoom });
    res.json({ success: true, message: 'បន្ទប់ត្រូវបានប្តូរដោយជោគជ័យ!' });
  } catch (err) {
    console.error('Edit room error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Edit user role
app.put('/api/users/:id/edit-role', async (req, res) => {
  try {
    const { newRole } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'MongoDB មិនទាន់ភ្ជាប់ទេ!' });
    }
    
    await User.findByIdAndUpdate(req.params.id, { role: newRole });
    res.json({ success: true, message: 'Role ត្រូវបានប្តូរដោយជោគជ័យ!' });
  } catch (err) {
    console.error('Edit role error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Change password
app.post('/api/change-password', async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, message: 'MongoDB មិនទាន់ភ្ជាប់ទេ!' });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.json({ success: false, message: 'User មិនមាន!' });
    }
    
    const isValidPassword = bcrypt.compareSync(oldPassword, user.password);
    if (!isValidPassword) {
      return res.json({ success: false, message: 'លេខសម្ងាត់ចាស់មិនត្រឹមត្រូវ!' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);
    user.password = hashedPassword;
    await user.save();
    
    res.json({ success: true, message: 'លេខសម្ងាត់ត្រូវបានប្តូរដោយជោគជ័យ!' });
  } catch (err) {
    console.error('Change password error:', err);
    res.json({ success: false, message: 'មានបញ្ហាក្នុងការប្តូរលេខសម្ងាត់!' });
  }
});

// ============================================================
// SOCKET.IO EVENTS
// ============================================================
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('join-room', async (roomId, peerId, username) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.peerId = peerId;
    socket.username = username;
    
    console.log(`📥 ${username} joined room: ${roomId}`);
    
    // Update room in database if MongoDB connected
    try {
      if (mongoose.connection.readyState === 1) {
        const room = await Room.findOne({ roomId });
        if (room) {
          if (!room.users.includes(username)) {
            room.users.push(username);
            await room.save();
          }
        } else {
          await Room.create({ roomId, users: [username] });
        }
      }
    } catch (err) {
      console.error('Error updating room:', err);
    }
    
    const roomSockets = await io.in(roomId).fetchSockets();
    const users = roomSockets
      .filter(s => s.id !== socket.id && s.peerId)
      .map(s => ({ peerId: s.peerId, username: s.username }));
    
    socket.emit('existing-users', users);
    socket.to(roomId).emit('user-joined', { peerId, username });
    socket.to(roomId).emit('play-sound', 'join');
  });
  
  socket.on('private-message', (data) => {
    io.to(data.toPeerId).emit('receive-private-message', {
      fromPeerId: socket.peerId,
      fromUsername: socket.username,
      message: data.message
    });
    io.to(data.toPeerId).emit('play-sound', 'message');
  });
  
  socket.on('screen-data-fallback', (data) => {
    socket.to(data.roomId).emit('screen-data-fallback', {
      fromPeerId: data.fromPeerId,
      screenData: data.screenData
    });
  });
  
  socket.on('stop-screen-fallback', (data) => {
    socket.to(data.roomId).emit('stop-screen-fallback', {
      fromPeerId: data.fromPeerId
    });
  });
  
  socket.on('remote-mouse-move', (data) => {
    io.to(data.targetId).emit('remote-mouse-move', { x: data.x, y: data.y });
  });
  
  socket.on('remote-mouse-click', (data) => {
    io.to(data.targetId).emit('remote-mouse-click', { x: data.x, y: data.y });
  });
  
  socket.on('remote-keyboard', (data) => {
    io.to(data.targetId).emit('remote-keyboard', { key: data.key });
  });
  
  socket.on('register-admin', () => {
    socket.isAdmin = true;
    console.log('👑 Admin registered:', socket.id);
  });
  
  socket.on('disconnect', async () => {
    console.log('🔌 Client disconnected:', socket.id);
    
    if (socket.roomId && socket.username) {
      try {
        if (mongoose.connection.readyState === 1) {
          const room = await Room.findOne({ roomId: socket.roomId });
          if (room) {
            room.users = room.users.filter(u => u !== socket.username);
            await room.save();
          }
        }
      } catch (err) {
        console.error('Error updating room on disconnect:', err);
      }
      
      socket.to(socket.roomId).emit('user-left', socket.peerId);
      socket.to(socket.roomId).emit('play-sound', 'leave');
      console.log(`👋 ${socket.username} left room: ${socket.roomId}`);
    }
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`📝 Default users: admin/admin123, supervisor/user123, rith/user123`);
});
