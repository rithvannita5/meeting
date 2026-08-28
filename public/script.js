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

socket.on('play-sound', (type) => {
  playNotificationSound(type);
});

socket.on('receive-otp', (data) => {
  alert(`🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នក!\n\n🔐 លេខកូដ 2FA៖ 【 ${data.otp} 】`);
});

socket.on('admin-alert', (data) => {
  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    alert(`🚨 សេចក្តីប្រកាសអាសន្នសុវត្ថិភាព!\n\nUser "${data.username}" កំពុង Login លើឧបករណ៍ចំនួន ${data.count}!`);
  }
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
  unreadChats[data.fromPeerId].username = data.fromUsername;
  
  updateChatBadge();
  if (!isChatOpen) showChatNotification(data.fromUsername, data.message, data.fromPeerId);
  updateChatUserList();
});

socket.on('existing-users', (users) => {
  users.forEach((user, index) => {
    userNamesMap[user.peerId] = user.username;
    addRemoteVideo(user.peerId, user.username);
    setTimeout(() => connectToUser(user.peerId), (index + 1) * 500);
  });
  updateUserCount();
  updateChatUserList();
});

socket.on('user-joined', ({ peerId, username }) => {
  if (peerId !== myId) {
    userNamesMap[peerId] = username;
    addRemoteVideo(peerId, username);
    updateUserCount();
    updateChatUserList();
  }
});

socket.on('user-left', (peerId) => {
  removeRemoteVideo(peerId);
  removeRemoteScreenVideo(peerId);
  if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
  delete userNamesMap[peerId];
  updateUserCount();
  updateChatUserList();
});

function playNotificationSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'join') {
      oscillator.frequency.value = 800;
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'leave') {
      oscillator.frequency.value = 600;
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'message') {
      oscillator.frequency.value = 900;
      gainNode.gain.value = 0.2;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.08);
    }
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
    <div class="msg-preview">${message.length > 50 ? message.substring(0, 50) + '...' : message}</div>
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
  playNotificationSound('message');
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
    const select = document.getElementById('roomSelect');
    const adminSelect = document.getElementById('userAssignedRoomSelect');
    if (select) select.innerHTML = data.rooms.map(r => `<option value="${r}">${r}</option>`).join('');
    if (adminSelect) adminSelect.innerHTML = data.rooms.map(r => `<option value="${r}">${r}</option>`).join('');
  } catch (err) {}
}

async function loadAdminRoomMonitor() {
  try {
    const res = await fetch('/api/rooms-status');
    const data = await res.json();
    const container = document.getElementById('activeRoomsList');
    container.innerHTML = data.rooms.map(room => {
      const isLive = room.userCount > 0;
      return `
        <div class="room-card ${isLive ? 'live' : ''}">
          <h4>បន្ទប់: ${room.roomId}</h4>
          <p>${isLive ? `🟢 (${room.userCount})` : '⚪ ទំនេរ'}</p>
          <button onclick="adminJoinRoom('${room.roomId}')" class="btn-success" style="width:100%; margin-top:10px;">ចូលរួម</button>
        </div>
      `;
    }).join('');
  } catch (err) {}
}

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = data.users.map(user => `
      <tr>
        <td><strong>${user.username}</strong></td>
        <td>${user.role}</td>
        <td>${user.assignedRoom}</td>
        <td>${user.isBlocked ? 'Blocked' : 'Active'}</td>
        <td><button class="action-btn btn-warning" onclick="toggleBlockUser('${user.id}')">Toggle</button></td>
      </tr>
    `).join('');
  } catch (err) {}
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
  if (!username || !password) return showToast('សូមបំពេញ Username និង Password!', 'error');
  pendingLoginData = { username, password, roomId };

  try {
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
  } catch (err) { showToast('Login Error!', 'error'); }
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

function cancel2FA() {
  document.getElementById('otp-modal').classList.add('hidden');
}

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

function logoutAdmin() {
  location.reload();
}

function toggleChat() {
  document.getElementById('chat-panel').classList.toggle('hidden');
  isChatOpen = !document.getElementById('chat-panel').classList.contains('hidden');
}

function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួល --</option>';
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
      ]
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

function removeRemoteVideo(peerId) {
  document.getElementById(`video-container-${peerId}`)?.remove();
}

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

function updateUserCount() {
  const count = document.querySelectorAll('#videoGrid .video-box').length;
  document.getElementById('welcome-text').innerText = `👋 ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return showToast('⚠️ Share Screen ប្រើបានតែលើកុំព្យូទ័រ!', 'warning');
  }
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
    showToast('✅ កំពុងចែករំលែក Screen!', 'success');
  } catch (err) {
    showToast('❌ មិនអាច Share Screen បានទេ (បើក Fallback Mode 代替)', 'error');
    document.getElementById('screenBtnFallback').style.display = 'inline-block';
  }
}

function stopScreenShare() {
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').className = 'btn-warning';
  removeRemoteScreenVideo('my-local-screen');
  screenStream?.getTracks().forEach(track => track.stop());
  screenStream = null;
}

// Socket.IO Fallback Screen Share for strict networks
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
        canvas.width = Math.min(bitmap.width, 800);
        canvas.height = Math.min(bitmap.height, 600);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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
    const stream = canvas.captureStream(10);
    addRemoteScreenVideo(data.fromPeerId, stream, userNamesMap[data.fromPeerId] || 'មិត្តភក្តិ' + ' (Fallback)');
  };
  img.src = data.screenData;
});

socket.on('stop-screen-fallback', (data) => {
  removeRemoteScreenVideo(data.fromPeerId);
});

function leaveRoom() {
  myPeer?.destroy();
  socket.disconnect();
  location.reload();
}

window.onload = loadRooms;
