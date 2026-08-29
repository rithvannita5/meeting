// ============================================================
// GLOBAL VARIABLES & CONFIGURATION
// ============================================================
let socket = null;
let socketConnected = false;
let connectionAttempts = 0;

let myPeer = null;
let myId = '';
let myUsername = '';
let currentUserRole = '';
let currentRoomId = '';

let localStream = null;
let cameraStream = null;
let screenStream = null;

const peerCalls = {};
const userNamesMap = {};

let isCameraOn = false;
let isMicOn = true;
let isScreenSharing = false;
let dummyAnimFrame = null;
let allRoomsList = [];
let pendingLoginData = null;

// Remote Control States
let isRemoteControlActive = false;
let remoteControlTarget = null;
let remoteControlRequestId = null;
let isBeingControlled = false;
let remotePointer = null;

// Private Chat States
let unreadChats = {};
let isChatOpen = false;
let autoReplyEnabled = true;

// ============================================================
// 1. SOCKET.IO CONNECTION & EVENT LISTENERS
// ============================================================
function connectSocket() {
  socket = io({
    transports: ['polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 60000,
    autoConnect: true,
    forceNew: true,
    path: '/socket.io',
    upgrade: false,
    rememberUpgrade: false,
    extraHeaders: { 'X-Forwarded-Proto': 'https' }
  });

  socket.on('connect_error', function(error) {
    console.log('❌ Socket.IO connection error:', error);
    connectionAttempts++;
    if (connectionAttempts > 5) showToast('⚠️ កំពុងព្យាយាមភ្ជាប់ Server...', 'warning');
  });

  socket.on('connect', function() {
    console.log('✅ Socket.IO connected successfully!');
    socketConnected = true;
    connectionAttempts = 0;
    showToast('✅ ភ្ជាប់ Server បានជោគជ័យ!', 'success');
  });

  socket.on('disconnect', function(reason) {
    console.log('🔌 Socket.IO disconnected:', reason);
    socketConnected = false;
    if (reason === 'io server disconnect') socket.connect();
  });

  socket.on('rooms-update', function() {
    const adminDash = document.getElementById('admin-dashboard');
    if ((currentUserRole === 'admin' || currentUserRole === 'supervisor') && adminDash && !adminDash.classList.contains('hidden')) {
      loadAdminRoomMonitor();
    }
  });

  socket.on('play-sound', function(type) {
    playNotificationSound(type);
  });

  socket.on('receive-otp', function(data) {
    alert('🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n\n🔐 នេះជាលេខកូដ 2FA របស់អ្នក៖ 【 ' + data.otp + ' 】');
  });

  socket.on('admin-alert', function(data) {
    if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
      alert('🚨 សេចក្តីប្រកាសអាសន្នសុវត្ថិភាព!\n\nUser ឈ្មោះ "' + data.username + '" កំពុង Login លើឧបករណ៍ចំនួន ' + data.count + ' ក្នុងពេលតែមួយ!');
    }
  });

  // Remote Control System Events
  socket.on('remote-control-request', function(data) {
    if (data.targetId === myId) {
      var username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
      if (confirm(username + ' ចង់គ្រប់គ្រង Screen របស់អ្នកពីចម្ងាយ។ តើអ្នកអនុញ្ញាតទេ?')) {
        fetch('/api/remote-control/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: data.requestId, targetId: myId })
        });
        isBeingControlled = true;
        alert('អ្នកបានអនុញ្ញាត Remote Control! អ្នកគ្រប់គ្រងអាចបញ្ជា Screen របស់អ្នកបាន។');
      } else {
        fetch('/api/remote-control/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: data.requestId })
        });
      }
    }
  });

  socket.on('remote-control-approved', function(data) {
    if (data.controllerId === myId) {
      alert('✅ Remote Control ត្រូវបានអនុញ្ញាត!');
      isRemoteControlActive = true;
      remoteControlTarget = data.targetId;
      startRemoteControl();
    }
  });

  socket.on('remote-control-rejected', function(data) {
    if (data.controllerId === myId) {
      alert('❌ Remote Control ត្រូវបានបដិសេធ!');
      isRemoteControlActive = false;
      remoteControlTarget = null;
    }
  });

  socket.on('remote-control-ended', function(data) {
    if (data.controllerId === myId || data.targetId === myId) {
      alert('Remote Control បានបញ្ចប់!');
      isRemoteControlActive = false;
      isBeingControlled = false;
      remoteControlTarget = null;
      stopRemoteControl();
      if (remotePointer) {
        remotePointer.remove();
        remotePointer = null;
      }
    }
  });

  socket.on('remote-mouse-move', function(data) {
    if (isBeingControlled) {
      showRemotePointer(data.x, data.y);
    }
  });

  socket.on('remote-mouse-click', function(data) {
    if (!isBeingControlled) return;
    var el = document.elementFromPoint(data.x, data.y);
    if (el) {
      el.click();
      showRemoteClick(data.x, data.y);
    }
  });

  // Private Chat Events
  socket.on('receive-private-message', function(data) {
    var chatMsgs = document.getElementById('chat-messages');
    if (chatMsgs) {
      chatMsgs.innerHTML += '<div class="msg-item"><b>From 👤 ' + data.fromUsername + ':</b><br>' + data.message + '</div>';
      chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }

    if (!unreadChats[data.fromPeerId]) {
      unreadChats[data.fromPeerId] = { count: 0, messages: [], username: data.fromUsername };
    }
    unreadChats[data.fromPeerId].count++;
    unreadChats[data.fromPeerId].messages.push(data.message);
    updateChatBadge();

    if (!isChatOpen) {
      showChatNotification(data.fromUsername, data.message, data.fromPeerId);
    }
  });

  // WebRTC User Events
  socket.on('existing-users', function(users) {
    users.forEach(function(user, index) {
      userNamesMap[user.peerId] = user.username;
      addRemoteVideo(user.peerId, user.username);
      setTimeout(function() {
        connectToUser(user.peerId);
      }, (index + 1) * 500);
    });
  });

  socket.on('user-joined', function(data) {
    if (data.peerId !== myId) {
      userNamesMap[data.peerId] = data.username;
      addRemoteVideo(data.peerId, data.username);
    }
  });

  socket.on('user-left', function(peerId) {
    removeRemoteVideo(peerId);
    if (peerCalls[peerId]) {
      peerCalls[peerId].close();
      delete peerCalls[peerId];
    }
    delete userNamesMap[peerId];
  });
}

// ============================================================
// 2. AUTHENTICATION & LOGIN MANAGEMENT
// ============================================================
async function login() {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value.trim();
  var roomId = document.getElementById('roomSelect').value;

  if (!username || !password) {
    return showToast('សូមបំពេញ Username និង Password!', 'error');
  }

  pendingLoginData = { username: username, password: password, roomId: roomId };

  try {
    var res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingLoginData)
    });
    var data = await res.json();

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
  var otp = document.getElementById('otpInput').value.trim();
  if (!otp) return showToast('សូមវាយបញ្ចូលលេខកូដ!', 'error');

  try {
    var res = await fetch('/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: pendingLoginData.username,
        password: pendingLoginData.password,
        otp: otp
      })
    });
    var data = await res.json();

    if (!data.success) return showToast(data.message, 'error');

    document.getElementById('otp-modal').classList.add('hidden');
    finalizeLogin(data);
  } catch (err) {
    showToast('លេខកូដមិនត្រឹមត្រូវទេ!', 'error');
  }
}

function finalizeLogin(data) {
  myUsername = data.user.username;
  currentUserRole = data.user.role;
  currentRoomId = (pendingLoginData && pendingLoginData.roomId) ? pendingLoginData.roomId : document.getElementById('roomSelect').value;

  const mainBody = document.getElementById('mainBody');
  if (mainBody) {
    mainBody.style.justifyContent = 'flex-start';
    mainBody.style.alignItems = 'stretch';
  }

  const authCard = document.getElementById('auth');
  if (authCard) authCard.classList.add('hidden');

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    const adminDash = document.getElementById('admin-dashboard');
    if (adminDash) adminDash.classList.remove('hidden');
    const adminRoleDisplay = document.getElementById('adminRoleDisplay');
    if (adminRoleDisplay) adminRoleDisplay.textContent = currentUserRole.toUpperCase();
    switchAdminTab('rooms');
  } else {
    startMeeting();
  }
  showToast('✅ ចូលប្រើប្រាស់បានជោគជ័យ!', 'success');
}

// ============================================================
// 3. MEETING ROOM & LEAVE ROOM MANAGEMENT (FIXED)
// ============================================================
function startMeeting() {
  const mainBody = document.getElementById('mainBody');
  if (mainBody) {
    mainBody.style.justifyContent = 'flex-start';
    mainBody.style.alignItems = 'stretch';
  }

  const roomContainer = document.getElementById('room-container');
  if (roomContainer) {
    roomContainer.classList.remove('hidden');
    roomContainer.style.display = 'flex';
  }

  const welcomeText = document.getElementById('welcome-text');
  if (welcomeText) {
    welcomeText.textContent = `👋 សួស្តី ${myUsername || 'Admin'}! កំពុងស្ថិតក្នុងបន្ទប់៖ ${currentRoomId}`;
  }

  initDummyStream();

  if (myPeer && myPeer.id) {
    myId = myPeer.id;
    socket.emit('join-room', { roomId: currentRoomId, peerId: myId, username: myUsername });
  } else {
    initPeerJS();
  }
}

// ** មុខងារចុចចាកចេញដែលបាន Fix រួច 100% **
function leaveRoom() {
  if (!confirm('តើអ្នកប្រាកដជាចង់ចាកចេញពីបន្ទប់នេះទេ?')) return;

  // ១. បិទ Stream ទាំងអស់
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  // ២. ផ្ដាច់ Peer Connections
  if (peerCalls) {
    Object.keys(peerCalls).forEach(pId => {
      if (peerCalls[pId]) peerCalls[pId].close();
    });
  }
  if (myPeer) {
    myPeer.destroy();
    myPeer = null;
  }

  // ៣. ផ្ញើ Signal ទៅ Server
  if (socket && socketConnected) {
    socket.emit('leave-room', { roomId: currentRoomId, peerId: myId });
  }

  // ៤. លាក់បន្ទប់ Meeting
  const roomContainer = document.getElementById('room-container');
  if (roomContainer) {
    roomContainer.classList.add('hidden');
    roomContainer.style.display = 'none';
  }

  const chatPanel = document.getElementById('chat-panel');
  if (chatPanel) chatPanel.classList.add('hidden');

  // ៥. បែកចែកសកម្មភាពតាម Role
  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    const adminDash = document.getElementById('admin-dashboard');
    if (adminDash) adminDash.classList.remove('hidden');
    switchAdminTab('rooms');
    showToast('🚪 បានចាកចេញមកកាន់ Dashboard!', 'warning');
  } else {
    location.reload(); // Logout សម្រាប់ User ធម្មតា
  }
}

function leaveMeeting() {
  leaveRoom();
}

// ============================================================
// 4. USER PASSWORD CHANGE SYSTEM (FIXED)
// ============================================================
async function changeMyPassword() {
  const oldPassword = prompt('សូមបញ្ចូល Password ចាស់របស់អ្នក៖');
  if (oldPassword === null) return;

  const newPassword = prompt('សូមបញ្ចូល Password ថ្មី៖');
  if (newPassword === null) return;

  if (!oldPassword.trim() || !newPassword.trim()) {
    return showToast('សូមបំពេញ Password ឱ្យបានត្រឹមត្រូវ!', 'error');
  }

  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: myUsername,
        oldPassword: oldPassword,
        newPassword: newPassword
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('✅ ប្តូរ Password បានជោគជ័យ!', 'success');
    } else {
      showToast(data.message || '❌ ប្តូរ Password មិនបានសម្រេច!', 'error');
    }
  } catch (err) {
    showToast('❌ មានបញ្ហាក្នុងការភ្ជាប់ទៅ Server!', 'error');
  }
}

// ============================================================
// 5. ADMIN CONTROL PANEL & USER CRUD
// ============================================================
function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  const adminDash = document.getElementById('admin-dashboard');
  if (adminDash) adminDash.classList.add('hidden');
  startMeeting();
}

function logoutAdmin() {
  if (confirm('តើអ្នកប្រាកដថាចង់ចាកចេញពីប្រព័ន្ធ (Logout) ទេ?')) {
    location.reload();
  }
}
function adminLogout() {
  logoutAdmin();
}

function switchAdminTab(tab) {
  var panes = document.querySelectorAll('.tab-pane');
  panes.forEach(function(el) { el.classList.add('hidden'); });

  var buttons = document.querySelectorAll('.nav-tabs button');
  buttons.forEach(function(el) { el.classList.remove('active'); });

  if (tab === 'rooms') {
    if (document.getElementById('tab-rooms')) document.getElementById('tab-rooms').classList.remove('hidden');
    if (document.getElementById('tabBtnRooms')) document.getElementById('tabBtnRooms').classList.add('active');
    loadAdminRoomMonitor();
  } else if (tab === 'users') {
    if (document.getElementById('tab-users')) document.getElementById('tab-users').classList.remove('hidden');
    if (document.getElementById('tabBtnUsers')) document.getElementById('tabBtnUsers').classList.add('active');
    loadUsersTable();
  } else if (tab === 'newRoom') {
    if (document.getElementById('tab-newRoom')) document.getElementById('tab-newRoom').classList.remove('hidden');
    if (document.getElementById('tabBtnNewRoom')) document.getElementById('tabBtnNewRoom').classList.add('active');
  }
}

async function createNewRoom() {
  var roomName = document.getElementById('newRoomInput').value.trim();
  if (!roomName) return showToast('សូមបញ្ចូលឈ្មោះបន្ទប់!', 'error');

  try {
    var res = await fetch('/api/rooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName: roomName })
    });
    var data = await res.json();
    if (data.success) {
      showToast('✅ បង្កើតបន្ទប់បានជោគជ័យ!', 'success');
      document.getElementById('newRoomInput').value = '';
      loadRooms();
      switchAdminTab('rooms');
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការបង្កើតបន្ទប់!', 'error');
  }
}

async function loadRooms() {
  try {
    var res = await fetch('/api/rooms');
    var data = await res.json();
    allRoomsList = data.rooms;
    var select = document.getElementById('roomSelect');
    if (select) {
      select.innerHTML = '';
      data.rooms.forEach(function(r) {
        select.innerHTML += '<option value="' + r + '">' + r + '</option>';
      });
    }
  } catch (err) {}
}

async function loadAdminRoomMonitor() {
  try {
    var res = await fetch('/api/rooms-status');
    var data = await res.json();
    var container = document.getElementById('activeRoomsList');
    if (!container) return;
    container.innerHTML = '';

    data.rooms.forEach(function(room) {
      var isLive = room.userCount > 0;
      container.innerHTML += `
        <div class="room-card ${isLive ? 'live' : ''}">
          <h4>បន្ទប់: ${room.roomId}</h4>
          <p style="font-size:13px; margin: 8px 0; color: #cbd5e1;">${isLive ? '🟢 ' + room.userCount + ' នាក់កំពុងចូល' : '⚪ ទំនេរ'}</p>
          <button onclick="adminJoinRoom('${room.roomId}')" class="btn-success" style="width: 100%;">🚪 ចូលមើលបន្ទប់នេះ</button>
        </div>
      `;
    });
  } catch (err) {}
}

async function loadUsersTable() {
  try {
    var res = await fetch('/api/users');
    var data = await res.json();
    var tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.users.forEach(function(user) {
      var isBlocked = user.isBlocked;
      var adminActions = (user.role === 'admin') ? '<span style="color:#64748b;">មិនអាចកែប្រែ</span>' : `
        <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${isBlocked ? 'Unblock' : 'Block'}</button>
        <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
        ${currentUserRole === 'admin' ? `<button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">លុប</button>` : ''}
      `;

      tbody.innerHTML += `
        <tr>
          <td><strong>${user.username}</strong></td>
          <td>${user.role}</td>
          <td>${user.assignedRoom}</td>
          <td>${isBlocked ? '<span style="color:#ef4444;">Blocked</span>' : '<span style="color:#10b981;">Active</span>'}</td>
          <td>${adminActions}</td>
        </tr>
      `;
    });
  } catch (err) {}
}

async function toggleBlockUser(id) {
  var res = await fetch('/api/users/' + id + '/toggle-block', { method: 'PUT' });
  var data = await res.json();
  showToast(data.message, 'success');
  loadUsersTable();
}

async function deleteUser(id, username) {
  if (!confirm('តើអ្នកប្រាកដថាចង់លុប User "' + username + '" ទេ?')) return;
  var res = await fetch('/api/users/' + id, { method: 'DELETE' });
  var data = await res.json();
  showToast(data.message, 'success');
  loadUsersTable();
}

async function resetPassword(id, username) {
  var newPassword = prompt('បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ' + username + ':');
  if (!newPassword) return;
  var res = await fetch('/api/users/' + id + '/reset-password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: newPassword })
  });
  var data = await res.json();
  showToast(data.message, 'success');
}

async function createUser() {
  var u = document.getElementById('newUsername').value.trim();
  var p = document.getElementById('newPassword').value.trim();
  var r = document.getElementById('newRole').value;
  var rm = document.getElementById('newAssignedRoom').value;

  if (!u || !p) return showToast('សូមបំពេញ Username និង Password!', 'error');

  var res = await fetch('/api/users/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p, role: r, assignedRoom: rm })
  });
  var data = await res.json();

  if (data.success) {
    showToast('✅ បង្កើត User បានជោគជ័យ!', 'success');
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    loadUsersTable();
  } else {
    showToast(data.message, 'error');
  }
}

// ============================================================
// 6. WEBRTC MEDIA & CANVAS ENGINE
// ============================================================
function initDummyStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(myUsername || 'User', 320, 240);
    dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw();

  localStream = canvas.captureStream(15);
  const localVideo = document.getElementById('localVideo');
  if (localVideo) localVideo.srcObject = localStream;
}

function initPeerJS() {
  myPeer = new Peer(undefined, {
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });

  myPeer.on('open', function(id) {
    myId = id;
    socket.emit('join-room', { roomId: currentRoomId, peerId: myId, username: myUsername });
  });

  myPeer.on('call', function(call) {
    call.answer(localStream);
    call.on('stream', function(remoteStream) {
      attachRemoteStream(call.peer, remoteStream);
    });
    peerCalls[call.peer] = call;
  });
}

function connectToUser(peerId) {
  if (!myPeer || peerCalls[peerId]) return;
  const call = myPeer.call(peerId, localStream);
  call.on('stream', function(remoteStream) {
    attachRemoteStream(peerId, remoteStream);
  });
  peerCalls[peerId] = call;
}

function addRemoteVideo(peerId, username) {
  const videoGrid = document.getElementById('videoGrid');
  if (!videoGrid || document.getElementById('video-' + peerId)) return;

  const card = document.createElement('div');
  card.className = 'video-box';
  card.id = 'video-' + peerId;
  card.innerHTML = `
    <video id="stream-${peerId}" autoplay playsinline></video>
    <div class="name-tag">👤 ${username}</div>
    <div class="remote-btn-group">
      <button class="small-btn" onclick="openPrivateChat('${peerId}', '${username}')">💬</button>
      <button class="small-btn" onclick="requestRemoteControl('${peerId}')">🖱️</button>
    </div>
  `;
  videoGrid.appendChild(card);
}

function attachRemoteStream(peerId, stream) {
  const v = document.getElementById('stream-' + peerId);
  if (v) v.srcObject = stream;
}

function removeRemoteVideo(peerId) {
  const card = document.getElementById('video-' + peerId);
  if (card) card.remove();
}

// Controls
function toggleMic() {
  if (!localStream) return;
  isMicOn = !isMicOn;
  localStream.getAudioTracks().forEach(track => track.enabled = isMicOn);
  showToast(isMicOn ? '🎤 បានបើក Mic' : '🎙️❌ បានបិទ Mic', 'info');
}

function toggleCamera() {
  showToast('កាមេរ៉ាត្រូវបាន Toggle', 'info');
}

function toggleScreenShare() {
  showToast('Screen Share ត្រូវបាន Toggle', 'info');
}

// ============================================================
// 7. PRIVATE CHAT & REMOTE CONTROL HELPERS
// ============================================================
function toggleChat() {
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.toggle('hidden');
}

function openPrivateChat(peerId, username) {
  toggleChat();
}

function updateChatBadge() {}
function showChatNotification(from, msg, id) {}

function requestRemoteControl(targetPeerId) {
  socket.emit('request-remote-control', { controllerId: myId, targetId: targetPeerId });
  showToast('បានផ្ញើសំណើ Remote Control...', 'info');
}

function startRemoteControl() {}
function stopRemoteControl() {}
function showRemotePointer(x, y) {}
function showRemoteClick(x, y) {}

// UI Utilities
function showToast(message, type) {
  var colors = { success: '#10b981', error: '#ef4444', info: '#48cae4', warning: '#f59e0b' };
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = colors[type] || '#48cae4';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3500);
}

function playNotificationSound(type) {
  try {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = type === 'join' ? 800 : 600;
    gain.gain.value = 0.2;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}
}

// App Initialization
window.addEventListener('DOMContentLoaded', function() {
  connectSocket();
  loadRooms();
});
