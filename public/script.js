let socket = null;
let socketConnected = false;
let connectionAttempts = 0;

let myPeer = null;
let myId = '';
let myUsername = '';
let currentUserRole = '';
let currentRoomId = '';
let localStream = null;
let screenStream = null;

const peerCalls = {};
const userNamesMap = {};

let isCameraOn = false;
let isMicOn = true;
let isScreenSharing = false;
let pendingLoginData = null;

const localVideo = document.getElementById('localVideo');
const screenGrid = document.getElementById('screenGrid');
const videoGrid = document.getElementById('videoGrid');

// CHAT
let unreadChats = {};
let isChatOpen = false;
let chatTargetPeerId = null;
let chatMessages = {};

// REMOTE CONTROL
let isRemoteControlActive = false;
let remoteControlTarget = null;
let isBeingControlled = false;
let remotePointer = null;

// STUN/TURN CONFIG (ដើម្បីទម្លុះ Render Host & Cross-Network)
const peerConfig = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelay', credential: 'openrelay' }
    ]
  }
};

window.onload = function() {
  fetchRooms();
  connectSocket();
  initDummyStream();
};

function connectSocket() {
  socket = io({
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    path: '/socket.io'
  });

  socket.on('connect', function() {
    console.log('✅ Socket.IO connected!');
    socketConnected = true;
    connectionAttempts = 0;
    if (myId && currentRoomId && myUsername) {
      socket.emit('join-room', { roomId: currentRoomId, peerId: myId, username: myUsername });
    }
  });

  socket.on('room-joined', function(data) {
    if (data.existingUsers) {
      data.existingUsers.forEach(function(user) {
        if (user.peerId !== myId) {
          userNamesMap[user.peerId] = user.username;
          addRemoteVideoBox(user.peerId, user.username);
          setTimeout(() => connectToUser(user.peerId), 500);
        }
      });
      updateChatUserList();
    }
  });

  socket.on('user-joined', function(data) {
    if (data.peerId !== myId) {
      userNamesMap[data.peerId] = data.username;
      addRemoteVideoBox(data.peerId, data.username);
      updateChatUserList();
      playNotificationSound('join');
      setTimeout(() => connectToUser(data.peerId), 500);

      if (isScreenSharing && screenStream) {
        setTimeout(() => {
          myPeer.call(data.peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
        }, 1000);
      }
    }
  });

  socket.on('user-left', function(data) {
    removeRemoteVideo(data.peerId);
    removeRemoteScreenVideo(data.peerId);
    if (peerCalls[data.peerId]) {
      peerCalls[data.peerId].close();
      delete peerCalls[data.peerId];
    }
    delete userNamesMap[data.peerId];
    updateChatUserList();
    playNotificationSound('leave');
  });

  socket.on('receive-private-message', function(data) {
    if (!chatMessages[data.fromPeerId]) chatMessages[data.fromPeerId] = [];
    chatMessages[data.fromPeerId].push({ from: data.fromPeerId, fromUsername: data.fromUsername, message: data.message, time: new Date().toLocaleTimeString() });

    if (chatTargetPeerId === data.fromPeerId && isChatOpen) renderChatMessages();

    if (!unreadChats[data.fromPeerId]) unreadChats[data.fromPeerId] = { count: 0, messages: [], username: data.fromUsername };
    unreadChats[data.fromPeerId].count++;
    updateChatBadge();
    updateChatUserList();
    playNotificationSound('message');
  });

  socket.on('receive-otp', function(data) {
    alert('🚨 ព្រមាន៖ មានគេកំពុង Login ចូលគណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n🔐 លេខកូដ 2FA របស់អ្នកគឺ៖ 【 ' + data.otp + ' 】');
  });

  socket.on('admin-alert', function(data) {
    if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
      alert('🚨 សេចក្តីប្រកាសអាសន្ន!\nUser: "' + data.username + '" កំពុង Login លើឧបករណ៍ចំនួន ' + data.count + '!');
    }
  });

  // REMOTE CONTROL SOCKET EVENTS
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
      showToast('✅ Remote Control ត្រូវបានអនុញ្ញាត!', 'success');
      isRemoteControlActive = true;
      remoteControlTarget = data.targetId;
      startRemoteControlListeners();
    }
  });

  socket.on('remote-control-rejected', function(data) {
    if (data.controllerId === myId) showToast('❌ គេបានបដិសេធ Remote Control!', 'danger');
  });

  socket.on('remote-mouse-move', function(data) {
    if (isBeingControlled) showRemotePointer(data.x, data.y);
  });

  socket.on('remote-mouse-click', function(data) {
    if (isBeingControlled) {
      var el = document.elementFromPoint(data.x, data.y);
      if (el) el.click();
      showRemoteClick(data.x, data.y);
    }
  });
}

// INITIALIZE PEERJS
function initPeer(peerId) {
  myPeer = new Peer(peerId, peerConfig);

  myPeer.on('open', function(id) {
    myId = id;
    if (socketConnected && currentRoomId) {
      socket.emit('join-room', { roomId: currentRoomId, peerId: myId, username: myUsername });
    }
  });

  myPeer.on('call', function(call) {
    call.answer(localStream);
    call.on('stream', function(remoteStream) {
      if (call.metadata && call.metadata.type === 'screen') {
        addRemoteScreenVideo(call.peer, remoteStream, call.metadata.username);
      } else {
        addRemoteVideoStream(call.peer, remoteStream);
      }
    });
    peerCalls[call.peer] = call;
  });
}

function connectToUser(peerId) {
  if (!myPeer || !localStream) return;
  const call = myPeer.call(peerId, localStream);
  call.on('stream', function(remoteStream) {
    addRemoteVideoStream(peerId, remoteStream);
  });
  peerCalls[peerId] = call;
}

// MEDIA CONTROL & DUMMY STREAM
function initDummyStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c2541'; ctx.fillRect(0, 0, 640, 480);
  const stream = canvas.captureStream(10);
  
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const dst = audioCtx.createMediaStreamDestination();
  osc.connect(dst); osc.start();
  
  localStream = new MediaStream([stream.getVideoTracks()[0], dst.stream.getAudioTracks()[0]]);
  localVideo.srcObject = localStream;
}

async function toggleCamera() {
  if (!isCameraOn) {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: isMicOn });
      replaceVideoTrack(camStream.getVideoTracks()[0]);
      isCameraOn = true;
      document.getElementById('camBtnIcon').classList.remove('off');
      document.getElementById('camBtnIcon').innerText = '📹';
    } catch (e) { showToast('មិនអាចបើកកាមេរ៉ាបានទេ', 'danger'); }
  } else {
    initDummyStream();
    replaceVideoTrack(localStream.getVideoTracks()[0]);
    isCameraOn = false;
    document.getElementById('camBtnIcon').classList.add('off');
    document.getElementById('camBtnIcon').innerText = '🚫';
  }
}

function toggleMic() {
  isMicOn = !isMicOn;
  if (localStream.getAudioTracks().length > 0) {
    localStream.getAudioTracks()[0].enabled = isMicOn;
  }
  document.getElementById('micBtnIcon').classList.toggle('off', !isMicOn);
}

function replaceVideoTrack(newTrack) {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) localStream.removeTrack(videoTrack);
  localStream.addTrack(newTrack);
  localVideo.srcObject = localStream;
  
  Object.values(peerCalls).forEach(call => {
    const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(newTrack);
  });
}

// SCREEN SHARING
async function toggleScreenShare() {
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      isScreenSharing = true;
      document.getElementById('screenBtn').classList.replace('btn-warning', 'btn-danger');
      document.getElementById('screenBtn').innerText = '🛑 បញ្ឈប់ Share Screen';

      addMyScreenVideo(screenStream);

      Object.keys(userNamesMap).forEach(peerId => {
        if (peerId !== myId) {
          myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
        }
      });

      screenStream.getVideoTracks()[0].onended = function() { stopScreenShare(); };
    } catch (err) { console.log('Cancel screen share', err); }
  } else {
    stopScreenShare();
  }
}

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  isScreenSharing = false;
  document.getElementById('screenBtn').classList.replace('btn-danger', 'btn-warning');
  document.getElementById('screenBtn').innerText = '🖥️ Share Screen';
  document.getElementById('screenGrid').innerHTML = '';
  document.getElementById('screenTitle').style.display = 'none';
}

function addMyScreenVideo(stream) {
  document.getElementById('screenTitle').style.display = 'block';
  const box = document.createElement('div');
  box.className = 'video-box screen-box';
  box.id = 'screen-me';
  box.innerHTML = `<div class="name-tag">🖥️ Screen (Me)</div><video autoplay playsinline muted></video>`;
  box.querySelector('video').srcObject = stream;
  screenGrid.appendChild(box);
}

function addRemoteScreenVideo(peerId, stream, username) {
  document.getElementById('screenTitle').style.display = 'block';
  let box = document.getElementById('screen-' + peerId);
  if (!box) {
    box = document.createElement('div');
    box.className = 'video-box screen-box';
    box.id = 'screen-' + peerId;
    box.innerHTML = `<div class="name-tag">🖥️ Screen: ${username || 'User'}</div><video autoplay playsinline></video>`;
    screenGrid.appendChild(box);
  }
  box.querySelector('video').srcObject = stream;
}

function removeRemoteScreenVideo(peerId) {
  const box = document.getElementById('screen-' + peerId);
  if (box) box.remove();
  if (screenGrid.children.length === 0) document.getElementById('screenTitle').style.display = 'none';
}

// VIDEO GRID HELPERS
function addRemoteVideoBox(peerId, username) {
  if (document.getElementById('box-' + peerId)) return;
  const box = document.createElement('div');
  box.className = 'video-box';
  box.id = 'box-' + peerId;
  box.innerHTML = `<div class="name-tag">👤 ${username}</div><video id="vid-${peerId}" autoplay playsinline></video>`;
  videoGrid.appendChild(box);
}

function addRemoteVideoStream(peerId, stream) {
  addRemoteVideoBox(peerId, userNamesMap[peerId] || 'User');
  const videoElem = document.getElementById('vid-' + peerId);
  if (videoElem) videoElem.srcObject = stream;
}

function removeRemoteVideo(peerId) {
  const box = document.getElementById('box-' + peerId);
  if (box) box.remove();
}

// AUTH & LOGIN
function login() {
  const usernameInput = document.getElementById('username').value.trim();
  const passwordInput = document.getElementById('password').value.trim();
  const roomSelect = document.getElementById('roomSelect').value;

  if (!usernameInput || !passwordInput) return showToast('សូមបញ្ចូល Username & Password!', 'danger');

  let deviceId = localStorage.getItem('app_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('app_device_id', deviceId);
  }

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameInput, password: passwordInput, roomId: roomSelect, deviceId: deviceId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.require2FA) {
      pendingLoginData = { username: usernameInput, roomId: roomSelect, deviceId: deviceId };
      document.getElementById('otp-modal').classList.remove('hidden');
    } else if (data.success) {
      myUsername = usernameInput;
      currentUserRole = data.role;
      currentRoomId = roomSelect;

      if (data.role === 'admin') {
        document.getElementById('auth').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        loadAdminRooms();
      } else {
        startRoomSession(data.peerId);
      }
    } else {
      showToast(data.message || 'Login បរាជ័យ!', 'danger');
    }
  });
}

function verify2FA() {
  const otp = document.getElementById('otpInput').value.trim();
  if (!otp) return showToast('សូមបញ្ចូល OTP!', 'danger');

  fetch('/api/verify-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: pendingLoginData.username, otp: otp, deviceId: pendingLoginData.deviceId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      document.getElementById('otp-modal').classList.add('hidden');
      myUsername = pendingLoginData.username;
      currentUserRole = data.role;
      currentRoomId = pendingLoginData.roomId;
      startRoomSession(data.peerId);
    } else {
      showToast(data.message || '2FA មិនត្រឹមត្រូវ!', 'danger');
    }
  });
}

function cancel2FA() {
  document.getElementById('otp-modal').classList.add('hidden');
  pendingLoginData = null;
}

function startRoomSession(peerId) {
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('room-container').classList.remove('hidden');
  document.getElementById('welcome-text').innerText = '👋 សួស្តី, ' + myUsername;
  initPeer(peerId);
}

function fetchRooms() {
  fetch('/api/rooms')
  .then(res => res.json())
  .then(rooms => {
    const sel = document.getElementById('roomSelect');
    sel.innerHTML = '';
    rooms.forEach(r => {
      sel.innerHTML += `<option value="${r.id}">${r.name || r.id}</option>`;
    });
  });
}

// CHAT FUNCTIONS
function toggleChat() {
  isChatOpen = !isChatOpen;
  document.getElementById('chat-panel').classList.toggle('hidden', !isChatOpen);
}

function updateChatUserList() {
  const list = document.getElementById('chatUserList');
  list.innerHTML = `<div style="padding:10px; color:#666; font-size:12px;">អ្នកប្រើក្នុងបន្ទប់</div>`;
  Object.keys(userNamesMap).forEach(peerId => {
    const name = userNamesMap[peerId];
    const item = document.createElement('div');
    item.className = 'chat-user-item';
    item.onclick = () => selectChatUser(peerId, name);
    item.innerHTML = `<div class="user-name">${name}</div>`;
    list.appendChild(item);
  });
}

function selectChatUser(peerId, name) {
  chatTargetPeerId = peerId;
  document.getElementById('chatTitle').innerText = name;
  document.getElementById('chatMessagesContainer').classList.add('show');
  if (unreadChats[peerId]) {
    delete unreadChats[peerId];
    updateChatBadge();
  }
  renderChatMessages();
}

function showChatUserList() {
  document.getElementById('chatMessagesContainer').classList.remove('show');
}

function sendPrivateMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg || !chatTargetPeerId) return;

  socket.emit('send-private-message', {
    toPeerId: chatTargetPeerId,
    message: msg,
    fromUsername: myUsername
  });

  if (!chatMessages[chatTargetPeerId]) chatMessages[chatTargetPeerId] = [];
  chatMessages[chatTargetPeerId].push({ from: myId, fromUsername: myUsername, message: msg, time: new Date().toLocaleTimeString() });

  input.value = '';
  renderChatMessages();
}

function renderChatMessages() {
  const box = document.getElementById('chatMessages');
  box.innerHTML = '';
  const msgs = chatMessages[chatTargetPeerId] || [];
  msgs.forEach(m => {
    const isMe = m.from === myId;
    const div = document.createElement('div');
    div.className = `chat-msg ${isMe ? 'my-msg' : 'other-msg'}`;
    div.innerHTML = `<div class="msg-bubble">${m.message}</div><div class="msg-time">${m.time}</div>`;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

function updateChatBadge() {
  const count = Object.values(unreadChats).reduce((a, b) => a + b.count, 0);
  const badge = document.getElementById('chatBadgeCount');
  if (count > 0) {
    badge.innerText = count;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

// REMOTE CONTROL
function showRemoteUserSelector() {
  const users = Object.keys(userNamesMap);
  if (users.length === 0) return showToast('គ្មានអ្នកផ្សេងនៅក្នុងបន្ទប់ទេ!', 'warning');
  const targetId = prompt('បញ្ចូល Peer ID អ្នកដែលអ្នកចង់ Remote:\n' + users.map(id => id + ' (' + userNamesMap[id] + ')').join('\n'));
  if (targetId && userNamesMap[targetId]) {
    socket.emit('request-remote-control', { controllerId: myId, targetId: targetId });
    showToast('កំពុងផ្ញើសំណើ Remote...', 'warning');
  }
}

function startRemoteControlListeners() {
  window.addEventListener('mousemove', e => {
    if (isRemoteControlActive && remoteControlTarget) {
      socket.emit('remote-mouse-move', { targetId: remoteControlTarget, x: e.clientX, y: e.clientY });
    }
  });
  window.addEventListener('click', e => {
    if (isRemoteControlActive && remoteControlTarget) {
      socket.emit('remote-mouse-click', { targetId: remoteControlTarget, x: e.clientX, y: e.clientY });
    }
  });
}

function showRemotePointer(x, y) {
  if (!remotePointer) {
    remotePointer = document.createElement('div');
    remotePointer.className = 'remote-pointer';
    document.body.appendChild(remotePointer);
  }
  remotePointer.style.left = x + 'px';
  remotePointer.style.top = y + 'px';
}

function showRemoteClick(x, y) {
  const effect = document.createElement('div');
  effect.className = 'click-effect';
  effect.style.left = x + 'px';
  effect.style.top = y + 'px';
  document.body.appendChild(effect);
  setTimeout(() => effect.remove(), 500);
}

// ADMIN DASHBOARD
function switchAdminTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
}

function loadAdminRooms() {
  fetch('/api/rooms/status')
  .then(res => res.json())
  .then(data => {
    const grid = document.getElementById('activeRoomsList');
    grid.innerHTML = '';
    data.forEach(r => {
      grid.innerHTML += `<div class="room-card ${r.users.length > 0 ? 'live' : ''}">
        <h4>📡 ${r.name || r.id}</h4>
        <p>ចំនួនមនុស្ស: ${r.users.length}</p>
      </div>`;
    });
  });
}

// UTILS
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = type === 'danger' ? '#ef4444' : type === 'success' ? '#10b981' : '#00b4d8';
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function playNotificationSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

function leaveRoom() { location.reload(); }
function logoutAdmin() { location.reload(); }
