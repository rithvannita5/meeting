// ============================================================
// VARIABLES
// ============================================================
let socket = null;
let socketConnected = false;
let myPeer = null;
let myId = '';
let myUsername = '';
let currentUserRole = '';
let currentRoomId = '';
let localStream = null;
let isScreenSharing = false;
let peerCalls = {};
let userNamesMap = {};
let dummyAnimFrame = null;
let pendingLoginData = null;

const localVideo = document.getElementById('localVideo');
const videoGrid = document.getElementById('videoGrid');
const screenGrid = document.getElementById('screenGrid');

// ============================================================
// TURN SERVERS - FREE & RELIABLE
// ============================================================
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// ============================================================
// SOCKET CONNECTION
// ============================================================
function connectSocket() {
  socket = io({
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    path: '/socket.io'
  });

  socket.on('connect', function() {
    console.log('✅ Socket.IO connected!');
    socketConnected = true;
    showToast('✅ ភ្ជាប់ Server បានជោគជ័យ!', 'success');
    
    if (myId && currentRoomId && myUsername) {
      socket.emit('join-room', {
        roomId: currentRoomId,
        peerId: myId,
        username: myUsername
      });
    }
  });

  socket.on('disconnect', function() {
    console.log('🔌 Socket disconnected');
    socketConnected = false;
  });

  socket.on('connect_error', function(error) {
    console.log('❌ Socket error:', error);
    showToast('⚠️ កំពុងភ្ជាប់ Server...', 'warning');
  });

  // ========== Socket Events ==========
  socket.on('room-joined', function(data) {
    console.log('🏠 Joined room:', data.roomId);
    if (data.existingUsers) {
      data.existingUsers.forEach(function(user) {
        if (user.peerId !== myId) {
          userNamesMap[user.peerId] = user.username;
          addRemoteVideo(user.peerId, user.username);
          setTimeout(function() {
            connectToUser(user.peerId);
          }, 500);
        }
      });
      updateUserCount();
    }
  });

  socket.on('user-joined', function(data) {
    console.log('👤 User joined:', data.username);
    if (data.peerId !== myId) {
      userNamesMap[data.peerId] = data.username;
      addRemoteVideo(data.peerId, data.username);
      updateUserCount();
      
      setTimeout(function() {
        connectToUser(data.peerId);
      }, 500);

      if (isScreenSharing && localStream) {
        setTimeout(function() {
          const call = myPeer.call(data.peerId, localStream, {
            metadata: { type: 'screen', username: myUsername }
          });
        }, 1000);
      }
    }
  });

  socket.on('user-left', function(data) {
    console.log('👤 User left:', data.peerId);
    removeRemoteVideo(data.peerId);
    if (peerCalls[data.peerId]) {
      peerCalls[data.peerId].close();
      delete peerCalls[data.peerId];
    }
    delete userNamesMap[data.peerId];
    updateUserCount();
  });

  socket.on('receive-private-message', function(data) {
    console.log('💬 New message from:', data.fromUsername);
    showToast(`💬 ${data.fromUsername}: ${data.message}`, 'info');
  });

  socket.on('rooms-update', function() {
    if ((currentUserRole === 'admin' || currentUserRole === 'supervisor') && 
        !document.getElementById('admin-dashboard').classList.contains('hidden')) {
      loadAdminRoomMonitor();
    }
  });

  socket.on('receive-otp', function(data) {
    alert('🚨 លេខកូដ 2FA របស់អ្នក៖ 【 ' + data.otp + ' 】');
  });
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message, type) {
  if (type === undefined) type = 'info';
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#48cae4',
    warning: '#f59e0b'
  };
  
  document.querySelectorAll('.toast').forEach(function(el) { el.remove(); });
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = colors[type] || '#48cae4';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// ============================================================
// PEERJS FUNCTIONS
// ============================================================
function initPeerJS() {
  const isSecure = window.location.protocol === 'https:';
  const hostname = window.location.hostname;
  const port = isSecure ? 443 : (window.location.port || 80);
  
  myPeer = new Peer(undefined, {
    host: hostname,
    port: port,
    path: '/peerjs',
    secure: isSecure,
    debug: 2,
    config: {
      iceServers: ICE_SERVERS
    }
  });

  myPeer.on('open', function(id) {
    myId = id;
    console.log('✅ PeerJS Connected:', myId);
    
    if (socketConnected && currentRoomId && myUsername) {
      socket.emit('join-room', {
        roomId: currentRoomId,
        peerId: myId,
        username: myUsername
      });
    }
  });

  myPeer.on('call', function(call) {
    console.log('📞 Incoming call from:', call.peer);
    
    if (localStream) {
      call.answer(localStream);
    } else {
      initDummyStream();
      call.answer(localStream);
    }

    const type = call.metadata?.type || 'video';
    
    call.on('stream', function(remoteStream) {
      console.log('📺 Stream received from:', call.peer);
      if (type === 'screen') {
        addRemoteScreenVideo(call.peer, remoteStream);
      } else {
        attachRemoteStream(call.peer, remoteStream);
      }
    });

    call.on('close', function() {
      console.log('Call closed:', call.peer);
      removeRemoteVideo(call.peer);
      removeRemoteScreenVideo(call.peer);
      delete peerCalls[call.peer];
    });

    peerCalls[call.peer] = call;
  });

  myPeer.on('error', function(err) {
    console.error('❌ PeerJS Error:', err);
  });

  myPeer.on('disconnected', function() {
    console.log('🔌 PeerJS disconnected');
    if (myPeer && !myPeer.destroyed) {
      setTimeout(function() { myPeer.reconnect(); }, 3000);
    }
  });
}

function connectToUser(peerId) {
  if (!myPeer || peerCalls[peerId]) return;
  if (!localStream) initDummyStream();
  
  console.log('📞 Calling user:', peerId);
  const call = myPeer.call(peerId, localStream, {
    metadata: { type: 'video', username: myUsername }
  });

  call.on('stream', function(remoteStream) {
    attachRemoteStream(peerId, remoteStream);
  });

  call.on('close', function() {
    removeRemoteVideo(peerId);
    delete peerCalls[peerId];
  });

  peerCalls[peerId] = call;
}

// ============================================================
// MEDIA FUNCTIONS
// ============================================================
function initDummyStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(myUsername || 'User', canvas.width / 2, canvas.height / 2);
    dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw();

  const canvasStream = canvas.captureStream(15);
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioContext.createOscillator();
  const dst = audioContext.createMediaStreamDestination();
  osc.connect(dst);
  osc.start();
  const audioTrack = dst.stream.getAudioTracks()[0];
  audioTrack.enabled = false;

  localStream = new MediaStream([canvasStream.getVideoTracks()[0], audioTrack]);
  if (localVideo) localVideo.srcObject = localStream;
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById('video-' + peerId)) return;

  const card = document.createElement('div');
  card.className = 'video-box';
  card.id = 'video-' + peerId;
  card.innerHTML = `
    <div class="name-tag">👤 ${username}</div>
    <video id="stream-${peerId}" autoplay playsinline></video>
  `;
  videoGrid.appendChild(card);
}

function attachRemoteStream(peerId, stream) {
  const videoElem = document.getElementById('stream-' + peerId);
  if (videoElem) {
    videoElem.srcObject = stream;
    videoElem.play().catch(function(err) {
      console.log('⚠️ Video play blocked:', err);
    });
  }
}

function removeRemoteVideo(peerId) {
  const card = document.getElementById('video-' + peerId);
  if (card) card.remove();
}

function addRemoteScreenVideo(peerId, stream) {
  removeRemoteScreenVideo(peerId);

  const card = document.createElement('div');
  card.className = 'video-box screen-box';
  card.id = 'screen-' + peerId;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;

  const label = document.createElement('div');
  label.className = 'name-tag';
  label.textContent = '🖥️ Screen Share';

  card.appendChild(video);
  card.appendChild(label);
  screenGrid.appendChild(card);
  
  document.getElementById('screenTitle').style.display = 'block';
}

function removeRemoteScreenVideo(peerId) {
  const card = document.getElementById('screen-' + peerId);
  if (card) card.remove();
  
  if (screenGrid.children.length === 0) {
    document.getElementById('screenTitle').style.display = 'none';
  }
}

function updateUserCount() {
  // Optional: Update user count display
}

// ============================================================
// TOGGLE SCREEN SHARE
// ============================================================
async function toggleScreenShare() {
  if (isScreenSharing) {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    isScreenSharing = false;
    screenGrid.innerHTML = '';
    document.getElementById('screenTitle').style.display = 'none';
    initDummyStream();
    showToast('🖥️ បានឈប់ចែករំលែក', 'info');
  } else {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      isScreenSharing = true;
      localStream = screenStream;
      
      // Show local screen
      const card = document.createElement('div');
      card.className = 'video-box screen-box';
      card.id = 'local-screen';
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = screenStream;
      const label = document.createElement('div');
      label.className = 'name-tag';
      label.textContent = '🖥️ Screen: ' + myUsername + ' (អ្នក)';
      card.appendChild(video);
      card.appendChild(label);
      screenGrid.appendChild(card);
      document.getElementById('screenTitle').style.display = 'block';
      
      // Share with others
      Object.keys(userNamesMap).forEach(peerId => {
        if (peerId !== myId && myPeer) {
          const call = myPeer.call(peerId, screenStream, {
            metadata: { type: 'screen', username: myUsername }
          });
          peerCalls[peerId] = call;
        }
      });
      
      screenStream.getVideoTracks()[0].onended = () => {
        toggleScreenShare();
      };
      
      showToast('🖥️ កំពុងចែករំលែកអេក្រង់...', 'success');
    } catch (err) {
      showToast('❌ បោះបង់ការចែករំលែក!', 'warning');
    }
  }
}

// ============================================================
// AUTHENTICATION
// ============================================================
async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const roomId = document.getElementById('roomSelect').value;

  if (!username || !password) {
    return showToast('សូមបំពេញ Username និង Password!', 'error');
  }

  pendingLoginData = { username, password, roomId };

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingLoginData)
    });
    const data = await res.json();

    if (data.requires2FA) {
      showToast(data.message, 'warning');
      document.getElementById('otp-modal').classList.remove('hidden');
      return;
    }

    if (!data.success) {
      return showToast(data.message, 'error');
    }

    finalizeLogin(data);
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការ Login!', 'error');
  }
}

async function verify2FA() {
  const otp = document.getElementById('otpInput').value.trim();
  if (!otp) return showToast('សូមវាយបញ្ចូលលេខកូដ!', 'error');

  try {
    const res = await fetch('/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: pendingLoginData.username,
        password: pendingLoginData.password,
        otp: otp
      })
    });
    const data = await res.json();

    if (!data.success) return showToast(data.message, 'error');

    document.getElementById('otp-modal').classList.add('hidden');
    finalizeLogin(data);
  } catch (err) {
    showToast('លេខកូដមិនត្រឹមត្រូវទេ!', 'error');
  }
}

function cancel2FA() {
  document.getElementById('otp-modal').classList.add('hidden');
  pendingLoginData = null;
}

function finalizeLogin(data) {
  myUsername = data.user.username;
  currentUserRole = data.user.role;
  currentRoomId = pendingLoginData.roomId;

  document.getElementById('auth').classList.add('hidden');
  document.getElementById('mainBody').style.justifyContent = 'flex-start';
  document.getElementById('mainBody').style.alignItems = 'stretch';

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    document.getElementById('admin-dashboard').classList.remove('hidden');
    document.getElementById('adminRoleDisplay').textContent = currentUserRole.toUpperCase();
    switchAdminTab('rooms');
  } else {
    startMeeting();
  }
  showToast('✅ ចូលប្រើប្រាស់បានជោគជ័យ!', 'success');
}

// ============================================================
// MEETING ROOM
// ============================================================
function startMeeting() {
  document.getElementById('room-container').classList.remove('hidden');
  document.getElementById('room-container').style.display = 'flex';
  document.getElementById('welcome-text').textContent = `👋 សួស្តី ${myUsername}! បន្ទប់៖ ${currentRoomId}`;

  initDummyStream();
  
  if (!socketConnected) {
    showToast('⏳ កំពុងភ្ជាប់ Server...', 'info');
    const waitForSocket = setInterval(function() {
      if (socketConnected) {
        clearInterval(waitForSocket);
        initPeerJS();
      }
    }, 500);
    setTimeout(function() {
      clearInterval(waitForSocket);
      if (!myPeer) initPeerJS();
    }, 10000);
  } else {
    initPeerJS();
  }
}

function leaveRoom() {
  if (!confirm('តើអ្នកប្រាកដថាចង់ចាកចេញ?')) return;

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (peerCalls) {
    Object.keys(peerCalls).forEach(pId => {
      if (peerCalls[pId]) peerCalls[pId].close();
    });
  }
  if (myPeer) {
    myPeer.destroy();
    myPeer = null;
  }

  if (socketConnected) {
    socket.emit('leave-room', { roomId: currentRoomId, peerId: myId });
  }

  document.getElementById('room-container').classList.add('hidden');
  document.getElementById('room-container').style.display = 'none';

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    document.getElementById('admin-dashboard').classList.remove('hidden');
    switchAdminTab('rooms');
  } else {
    location.reload();
  }
}

// ============================================================
// ADMIN FUNCTIONS
// ============================================================
function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  document.getElementById('admin-dashboard').classList.add('hidden');
  startMeeting();
}

function logoutAdmin() {
  if (confirm('តើអ្នកប្រាកដថាចង់ Logout?')) {
    location.reload();
  }
}

function switchAdminTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(el => {
    el.classList.add('hidden');
    el.style.display = 'none';
  });
  document.querySelectorAll('.nav-tabs button').forEach(el => {
    el.classList.remove('active');
  });

  if (tab === 'rooms') {
    document.getElementById('tab-rooms').classList.remove('hidden');
    document.getElementById('tab-rooms').style.display = 'block';
    document.getElementById('tabBtnRooms').classList.add('active');
    loadAdminRoomMonitor();
  } else if (tab === 'users') {
    document.getElementById('tab-users').classList.remove('hidden');
    document.getElementById('tab-users').style.display = 'block';
    document.getElementById('tabBtnUsers').classList.add('active');
    loadUsersTable();
  } else if (tab === 'newRoom') {
    document.getElementById('tab-newRoom').classList.remove('hidden');
    document.getElementById('tab-newRoom').style.display = 'block';
    document.getElementById('tabBtnNewRoom').classList.add('active');
  }
}

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    const select = document.getElementById('roomSelect');
    if (select) {
      select.innerHTML = '';
      data.rooms.forEach(r => {
        select.innerHTML += `<option value="${r}">${r}</option>`;
      });
    }
    const userRoomSelect = document.getElementById('userAssignedRoomSelect');
    if (userRoomSelect) {
      userRoomSelect.innerHTML = '';
      data.rooms.forEach(r => {
        userRoomSelect.innerHTML += `<option value="${r}">${r}</option>`;
      });
    }
  } catch (err) {}
}

async function loadAdminRoomMonitor() {
  try {
    const res = await fetch('/api/rooms-status');
    const data = await res.json();
    const container = document.getElementById('activeRoomsList');
    container.innerHTML = '';

    data.rooms.forEach(room => {
      const isLive = room.userCount > 0;
      container.innerHTML += `
        <div class="room-card ${isLive ? 'live' : ''}">
          <h4>បន្ទប់: ${room.roomId}</h4>
          <p style="font-size:13px; margin: 8px 0; color: #cbd5e1;">${isLive ? '🟢 ' + room.userCount + ' នាក់' : '⚪ ទំនេរ'}</p>
          <button onclick="adminJoinRoom('${room.roomId}')" class="btn-success" style="width:100%;">🚪 ចូលមើល</button>
        </div>
      `;
    });
  } catch (err) {}
}

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    data.users.forEach(user => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${user.username}</strong></td>
          <td>${user.role}</td>
          <td>${user.assignedRoom}</td>
          <td>${user.isBlocked ? '<span style="color:#ef4444;">Blocked</span>' : '<span style="color:#10b981;">Active</span>'}</td>
          <td>
            <button class="action-btn ${user.isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${user.isBlocked ? 'Unblock' : 'Block'}</button>
            ${user.role !== 'admin' ? `<button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">លុប</button>` : ''}
          </td>
        </tr>
      `;
    });
  } catch (err) {}
}

async function toggleBlockUser(id) {
  await fetch('/api/users/' + id + '/toggle-block', { method: 'PUT' });
  showToast('បានប្តូរស្ថានភាពរួចរាល់!', 'success');
  loadUsersTable();
}

async function deleteUser(id, username) {
  if (!confirm('តើអ្នកប្រាកដថាចង់លុប User "' + username + '" ទេ?')) return;
  await fetch('/api/users/' + id, { method: 'DELETE' });
  showToast('លុប User រួចរាល់!', 'success');
  loadUsersTable();
}

async function createNewUser() {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value.trim();
  const assignedRoom = document.getElementById('userAssignedRoomSelect').value;
  const role = document.getElementById('newUserRoleSelect').value;

  if (!username || !password) {
    return showToast('សូមបំពេញ Username និង Password!', 'error');
  }

  const res = await fetch('/api/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, assignedRoom, role })
  });
  const data = await res.json();
  showToast(data.message, data.success ? 'success' : 'error');
  if (data.success) {
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    loadUsersTable();
  }
}

async function createNewRoom() {
  const roomId = document.getElementById('newRoomId').value.trim();
  if (!roomId) return showToast('សូមបញ្ចូលឈ្មោះបន្ទប់!', 'error');

  const res = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId })
  });
  const data = await res.json();
  showToast(data.message, data.success ? 'success' : 'error');
  if (data.success) {
    document.getElementById('newRoomId').value = '';
    loadRooms();
    loadAdminRoomMonitor();
  }
}

function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    panel.style.display = 'flex';
  }
}

function sendPrivateMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  // Send to all users (simplified)
  Object.keys(userNamesMap).forEach(peerId => {
    socket.emit('send-private-message', {
      targetPeerId: peerId,
      message: message,
      fromUsername: myUsername
    });
  });
  
  input.value = '';
  showToast('💬 បានផ្ញើសារ!', 'success');
}

// ============================================================
// APP INIT
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
  connectSocket();
  loadRooms();
  
  document.getElementById('chatInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') sendPrivateMessage();
  });
});
