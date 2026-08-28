const socket = io();
let myPeer;
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
let isScreenSharing = false;
let dummyAnimFrame = null;
let allRoomsList = [];
let pendingLoginData = null;

const localVideo = document.getElementById('localVideo');
const screenGrid = document.getElementById('screenGrid');
const videoGrid = document.getElementById('videoGrid');

let isRemoteControlActive = false;
let remoteControlTarget = null;
let remoteControlRequestId = null;
let isBeingControlled = false;
let remotePointer = null;

let unreadChats = {};
let isChatOpen = false;
let autoReplyEnabled = true;

let isScreenShareFallback = false;
let screenCaptureInterval = null;

socket.on('rooms-update', () => {
  if ((currentUserRole === 'admin' || currentUserRole === 'supervisor') && 
      !document.getElementById('admin-dashboard').classList.contains('hidden')) {
    loadAdminRoomMonitor();
  }
});

socket.on('play-sound', (type) => playNotificationSound(type));
socket.on('receive-otp', (data) => alert(`🚨 លេខកូដ 2FA: 【 ${data.otp} 】`));
socket.on('admin-alert', (data) => {
  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    alert(`🚨 User "${data.username}" កំពុង Login ចំនួន ${data.count}!`);
  }
});

// Remote Control Events
socket.on('remote-control-request', (data) => {
  if (data.targetId === myId) {
    const username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
    if (confirm(`${username} ចង់គ្រប់គ្រង Screen របស់អ្នក។ អនុញ្ញាតទេ?`)) {
      fetch('/api/remote-control/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: data.requestId, targetId: myId })
      });
      isBeingControlled = true;
      showToast('អ្នកបានអនុញ្ញាត Remote Control!', 'success');
    } else {
      fetch('/api/remote-control/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: data.requestId })
      });
    }
  }
});

socket.on('remote-control-approved', (data) => {
  if (data.controllerId === myId) {
    isRemoteControlActive = true;
    remoteControlTarget = data.targetId;
    startRemoteControl();
    showToast('✅ Remote Control បានចាប់ផ្តើម!', 'success');
  }
});

socket.on('remote-control-rejected', () => showToast('❌ Remote Control ត្រូវបានបដិសេធ!', 'error'));

socket.on('remote-control-ended', (data) => {
  if (data.controllerId === myId) {
    isRemoteControlActive = false;
    remoteControlTarget = null;
    stopRemoteControl();
  }
  if (data.targetId === myId) {
    isBeingControlled = false;
    if (remotePointer) { remotePointer.remove(); remotePointer = null; }
  }
  showToast('Remote Control បានបញ្ចប់!', 'info');
});

socket.on('remote-mouse-move', (data) => { if (isBeingControlled) showRemotePointer(data.x, data.y); });
socket.on('remote-mouse-click', (data) => {
  if (!isBeingControlled) return;
  const el = document.elementFromPoint(data.x, data.y);
  if (el) { el.click(); showRemoteClick(data.x, data.y); }
});

socket.on('receive-private-message', (data) => {
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item"><b>From 👤 ${data.fromUsername}:</b><br>${data.message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  
  if (!unreadChats[data.fromPeerId]) {
    unreadChats[data.fromPeerId] = { count: 0, messages: [], username: data.fromUsername };
  }
  unreadChats[data.fromPeerId].count++;
  unreadChats[data.fromPeerId].messages.push(data.message);
  updateChatBadge();
  if (!isChatOpen) showChatNotification(data.fromUsername, data.message, data.fromPeerId);
  updateChatUserList();
});

function playNotificationSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = type === 'join' ? 800 : type === 'leave' ? 600 : 900;
    gainNode.gain.value = 0.2;
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}
}

function updateChatBadge() {
  const badge = document.getElementById('chatBadgeCount');
  const totalUnread = Object.values(unreadChats).reduce((sum, u) => sum + u.count, 0);
  if (totalUnread > 0) {
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function showChatNotification(username, message, peerId) {
  document.querySelectorAll(`.chat-notification[data-peer="${peerId}"]`).forEach(el => el.remove());
  const notif = document.createElement('div');
  notif.className = 'chat-notification';
  notif.dataset.peer = peerId;
  notif.innerHTML = `
    <button class="close-notif" onclick="event.stopPropagation(); this.parentElement.remove()">✕</button>
    <div class="sender">👤 ${username}</div>
    <div class="msg-preview">${message}</div>
  `;
  notif.onclick = () => {
    if (!isChatOpen) toggleChat();
    document.getElementById('chatRecipientSelect').value = peerId;
    if (unreadChats[peerId]) unreadChats[peerId].count = 0;
    updateChatBadge();
    notif.remove();
  };
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 10000);
}

function showToast(message, type = 'info') {
  const colors = { success: '#10b981', error: '#ef4444', info: '#48cae4', warning: '#f59e0b' };
  document.querySelectorAll('.toast').forEach(el => el.remove());
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = colors[type] || '#48cae4';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Remote Control Handler
function requestRemoteControl(targetId) {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') return showToast('គ្មានសិទ្ធិប្រើប្រាស់!', 'error');
  fetch('/api/remote-control/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controllerId: myId, targetId, roomId: currentRoomId })
  }).then(res => res.json()).then(data => {
    if (data.success) showToast('កំពុងផ្ញើសំណើ...', 'info');
  });
}

function startRemoteControl() {
  document.addEventListener('mousemove', handleRemoteMouseMove);
  document.addEventListener('click', handleRemoteMouseClick);
  document.addEventListener('keydown', handleRemoteKeyboard);
}

function stopRemoteControl() {
  document.removeEventListener('mousemove', handleRemoteMouseMove);
  document.removeEventListener('click', handleRemoteMouseClick);
  document.removeEventListener('keydown', handleRemoteKeyboard);
}

function handleRemoteMouseMove(e) {
  if (isRemoteControlActive && remoteControlTarget) {
    socket.emit('remote-mouse-move', { targetId: remoteControlTarget, x: e.clientX, y: e.clientY });
  }
}

function handleRemoteMouseClick(e) {
  if (isRemoteControlActive && remoteControlTarget) {
    socket.emit('remote-mouse-click', { targetId: remoteControlTarget, x: e.clientX, y: e.clientY });
  }
}

function handleRemoteKeyboard(e) {
  if (isRemoteControlActive && remoteControlTarget) {
    socket.emit('remote-keyboard', { targetId: remoteControlTarget, key: e.key });
  }
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
  effect.style.left = x + 'px'; effect.style.top = y + 'px';
  document.body.appendChild(effect);
  setTimeout(() => effect.remove(), 500);
}

function showRemoteUserSelector() {
  const users = Object.entries(userNamesMap).filter(([id]) => id !== myId);
  if (users.length === 0) return showToast('គ្មានអ្នកប្រើប្រាស់ផ្សេងទេ!', 'warning');
  
  const targetId = prompt('ជ្រើសរើស PeerID ដែលចង់ Remote:\n' + users.map(([id, name]) => `${name}: ${id}`).join('\n'));
  if (targetId) requestRemoteControl(targetId.trim());
}

// Admin & Auth Functions
function switchAdminTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-tabs button').forEach(el => el.classList.remove('active'));
  if (tab === 'rooms') {
    document.getElementById('tab-rooms').classList.remove('hidden');
    document.getElementById('tabBtnRooms').classList.add('active');
    loadAdminRoomMonitor();
  } else if (tab === 'users') {
    document.getElementById('tab-users').classList.remove('hidden');
    document.getElementById('tabBtnUsers').classList.add('active');
    loadUsersTable();
  } else if (tab === 'newRoom') {
    document.getElementById('tab-newRoom').classList.remove('hidden');
    document.getElementById('tabBtnNewRoom').classList.add('active');
  }
}

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    allRoomsList = data.rooms;
    document.getElementById('roomSelect').innerHTML = data.rooms.map(r => `<option value="${r}">${r}</option>`).join('');
    const assignedSelect = document.getElementById('userAssignedRoomSelect');
    if (assignedSelect) assignedSelect.innerHTML = data.rooms.map(r => `<option value="${r}">${r}</option>`).join('');
  } catch (e) {}
}

async function loadAdminRoomMonitor() {
  try {
    const res = await fetch('/api/rooms-status');
    const data = await res.json();
    document.getElementById('activeRoomsList').innerHTML = data.rooms.map(room => `
      <div class="room-card ${room.userCount > 0 ? 'live' : ''}" style="background:#0b132b; padding:15px; border-radius:8px; border:1px solid #334155; width:250px;">
        <h4>បន្ទប់: ${room.roomId}</h4>
        <p>${room.userCount > 0 ? `🟢 សកម្ម (${room.userCount})` : '⚪ ទំនេរ'}</p>
        <button onclick="adminJoinRoom('${room.roomId}')" class="btn-success" style="width:100%; margin-top:10px;">ចូលរួម</button>
      </div>
    `).join('');
  } catch (e) {}
}

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    document.getElementById('userTableBody').innerHTML = data.users.map(u => `
      <tr>
        <td><strong>${u.username}</strong></td>
        <td>${u.role}</td>
        <td>${u.assignedRoom}</td>
        <td>${u.isBlocked ? 'Blocked' : 'Active'}</td>
        <td><button class="action-btn btn-warning" onclick="toggleBlockUser('${u.id}')">Block/Unblock</button></td>
      </tr>
    `).join('');
  } catch (e) {}
}

function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  document.getElementById('admin-dashboard').classList.add('hidden');
  startMeeting();
}

async function toggleBlockUser(id) {
  await fetch(`/api/users/${id}/toggle-block`, { method: 'PUT' });
  loadUsersTable();
}

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const roomId = document.getElementById('roomSelect').value;
  if (!username || !password) return showToast('បំពេញព័ត៌មានឱ្យគ្រប់!', 'error');
  pendingLoginData = { username, password, roomId };

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pendingLoginData)
  });
  const data = await res.json();
  if (data.requires2FA) {
    document.getElementById('otp-modal').classList.remove('hidden');
    return;
  }
  if (!data.success) return showToast(data.message, 'error');
  finalizeLogin(data);
}

async function verify2FA() {
  const otp = document.getElementById('otpInput').value.trim();
  const res = await fetch('/api/verify-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...pendingLoginData, otp })
  });
  const data = await res.json();
  if (!data.success) return showToast(data.message, 'error');
  document.getElementById('otp-modal').classList.add('hidden');
  finalizeLogin(data);
}

function cancel2FA() { document.getElementById('otp-modal').classList.add('hidden'); }

function finalizeLogin(data) {
  myUsername = data.user.username;
  currentUserRole = data.user.role;
  currentRoomId = pendingLoginData.roomId;
  document.getElementById('auth').classList.add('hidden');
  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    socket.emit('register-admin');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadAdminRoomMonitor();
    loadUsersTable();
  } else {
    startMeeting();
  }
}

async function changeMyPassword() {
  const oldPassword = prompt('លេខសម្ងាត់ចាស់:');
  const newPassword = prompt('លេខសម្ងាត់ថ្មី:');
  if (!oldPassword || !newPassword) return;
  const res = await fetch('/api/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: myUsername, oldPassword, newPassword })
  });
  const data = await res.json();
  showToast(data.message, data.success ? 'success' : 'error');
}

function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('hidden');
  isChatOpen = !panel.classList.contains('hidden');
}

function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  select.innerHTML = '<option value="">-- អ្នកទទួល --</option>';
  for (let [peerId, name] of Object.entries(userNamesMap)) {
    if (peerId !== myId) select.innerHTML += `<option value="${peerId}">${name}</option>`;
  }
}

function sendPrivateMsg() {
  const toPeerId = document.getElementById('chatRecipientSelect').value;
  const message = document.getElementById('chatInput').value.trim();
  if (!toPeerId || !message) return;
  socket.emit('private-message', { toPeerId, message });
  document.getElementById('chat-messages').innerHTML += `<div class="msg-item me"><b>Me:</b><br>${message}</div>`;
  document.getElementById('chatInput').value = '';
}

// WebRTC & PeerJS
function createActiveDummyVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 240;
  const ctx = canvas.getContext('2d');
  let angle = 0;
  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(160 + Math.cos(angle) * 30, 120 + Math.sin(angle) * 20, 10, 0, Math.PI * 2);
    ctx.fill();
    angle += 0.08;
    dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw();
  return canvas.captureStream(15).getVideoTracks()[0];
}

async function startMeeting() {
  let audioTrack;
  try {
    const userMedia = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioTrack = userMedia.getAudioTracks()[0];
  } catch (e) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioTrack = audioCtx.createMediaStreamDestination().stream.getAudioTracks()[0];
    audioTrack.enabled = false;
  }

  localStream = new MediaStream([audioTrack, createActiveDummyVideoTrack()]);
  localVideo.srcObject = localStream;

  // កំណត់ TURN Server ដើម្បីឱ្យ Screen Share អាចឆ្លង Network ផ្សេងគ្នាបាន
  myPeer = new Peer(undefined, {
    host: window.location.hostname,
    port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs',
    secure: window.location.protocol === 'https:',
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceTransportPolicy: 'all'
    }
  });

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `👋 ${myUsername} | បន្ទប់: ${currentRoomId}`;
    socket.emit('join-room', currentRoomId, id, myUsername);
  });

  myPeer.on('call', (call) => {
    const callType = call.metadata ? call.metadata.type : 'camera';
    const callerName = call.metadata ? call.metadata.username : 'ដៃគូ';

    if (callType === 'screen') {
      call.answer();
      call.on('stream', (remoteScreenStream) => {
        addRemoteScreenVideo(call.peer, remoteScreenStream, callerName);
      });
      return;
    }

    call.answer(isCameraOn ? cameraStream : localStream);
    peerCalls[call.peer] = call;
    addRemoteVideo(call.peer, callerName);
    call.on('stream', (remoteStream) => {
      const videoEl = document.getElementById(`video-${call.peer}`);
      if (videoEl) videoEl.srcObject = remoteStream;
    });
  });

  socket.on('existing-users', (users) => {
    users.forEach((user, index) => {
      userNamesMap[user.peerId] = user.username;
      addRemoteVideo(user.peerId, user.username);
      setTimeout(() => connectToUser(user.peerId), (index + 1) * 500);
    });
    updateChatUserList();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    if (peerId !== myId) {
      userNamesMap[peerId] = username;
      addRemoteVideo(peerId, username);
      updateChatUserList();
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
    delete userNamesMap[peerId];
    updateChatUserList();
  });
}

function connectToUser(peerId) {
  if (peerCalls[peerId]) return;
  const streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;
  const call = myPeer.call(peerId, streamToSend, { metadata: { type: 'camera', username: myUsername } });
  peerCalls[peerId] = call;
  call.on('stream', (remoteStream) => {
    const videoEl = document.getElementById(`video-${peerId}`);
    if (videoEl) videoEl.srcObject = remoteStream;
  });
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;
  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `video-container-${peerId}`;
  container.innerHTML = `
    <div class="name-tag">👤 ${username}</div>
    <video id="video-${peerId}" autoplay playsinline></video>
  `;
  videoGrid.appendChild(container);
}

function removeRemoteVideo(peerId) { document.getElementById(`video-container-${peerId}`)?.remove(); }

function addRemoteScreenVideo(peerId, stream, sharerName) {
  screenGrid.style.display = 'grid';
  document.getElementById('screenTitle').style.display = 'block';
  let screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (!screenContainer) {
    screenContainer = document.createElement('div');
    screenContainer.className = 'video-box screen-box';
    screenContainer.id = `screen-container-${peerId}`;
    screenContainer.innerHTML = `
      <div class="name-tag" style="background:#f59e0b; color:#000;">🖥️ ${sharerName}</div>
      <video id="screen-video-${peerId}" autoplay playsinline></video>
    `;
    screenGrid.appendChild(screenContainer);
  }
  const screenVideo = document.getElementById(`screen-video-${peerId}`);
  if (screenVideo) {
    screenVideo.srcObject = stream;
    screenVideo.play().catch(() => {});
  }
}

function removeRemoteScreenVideo(peerId) {
  document.getElementById(`screen-container-${peerId}`)?.remove();
  if (screenGrid.children.length === 0) {
    screenGrid.style.display = 'none';
    document.getElementById('screenTitle').style.display = 'none';
  }
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices?.getDisplayMedia) return showToast('Share Screen ប្រើបានតែលើកុំព្យូទ័រ!', 'warning');
  if (isScreenSharing) {
    stopScreenShare();
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    isScreenSharing = true;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').className = 'btn-danger';
    addRemoteScreenVideo('my-local-screen', screenStream, myUsername + ' (អ្នក)');

    for (const peerId of Object.keys(peerCalls)) {
      myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
    }

    screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    showToast('✅ កំពុង Share Screen!', 'success');
  } catch (err) {
    showToast('❌ បរាជ័យក្នុងការ Share Screen!', 'error');
    document.getElementById('screenBtnFallback').style.display = 'inline-block';
  }
}

function stopScreenShare() {
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').className = 'btn-warning';
  removeRemoteScreenVideo('my-local-screen');
  screenStream?.getTracks().forEach(t => t.stop());
  screenStream = null;
}

// Fallback Screen Share via Socket.IO (ការពារกรณี Network បិទ WebRTC Stream)
async function toggleScreenShareFallback() {
  if (isScreenShareFallback) {
    stopScreenShareFallback();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1280, height: 720, frameRate: 15 }, audio: false });
    isScreenShareFallback = true;
    document.getElementById('screenBtnFallback').innerHTML = '🛑 Stop (Fallback)';
    document.getElementById('screenBtnFallback').className = 'btn-danger';
    document.getElementById('screenBtn').style.display = 'none';

    addRemoteScreenVideo('my-local-screen-fallback', stream, myUsername + ' (Fallback)');
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);

    screenCaptureInterval = setInterval(async () => {
      try {
        const bitmap = await imageCapture.grabFrame();
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 600;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        socket.emit('screen-data-fallback', { roomId: currentRoomId, fromPeerId: myId, screenData: canvas.toDataURL('image/jpeg', 0.4) });
      } catch (e) {}
    }, 200);

    videoTrack.onended = () => stopScreenShareFallback();
    showToast('✅ Fallback Screen Share បានចាប់ផ្តើម!', 'success');
  } catch (e) {
    showToast('❌ Fallback Error!', 'error');
  }
}

function stopScreenShareFallback() {
  isScreenShareFallback = false;
  clearInterval(screenCaptureInterval);
  document.getElementById('screenBtnFallback').innerHTML = '📡 Share (Fallback)';
  document.getElementById('screenBtnFallback').className = 'btn-secondary';
  document.getElementById('screenBtn').style.display = 'inline-block';
  removeRemoteScreenVideo('my-local-screen-fallback');
  socket.emit('stop-screen-fallback', { roomId: currentRoomId, fromPeerId: myId });
}

socket.on('screen-data-fallback', (data) => {
  if (data.fromPeerId === myId) return;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    addRemoteScreenVideo(data.fromPeerId, canvas.captureStream(10), (userNamesMap[data.fromPeerId] || 'មិត្តភក្តិ') + ' (Fallback)');
  };
  img.src = data.screenData;
});

socket.on('stop-screen-fallback', (data) => removeRemoteScreenVideo(data.fromPeerId));

function leaveRoom() {
  myPeer?.destroy();
  socket.disconnect();
  location.reload();
}

window.onload = loadRooms;
