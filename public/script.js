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
let pendingLoginData = null; // ទុកទិន្នន័យចាំវាយកូដ 2FA

const localVideo = document.getElementById('localVideo');
const screenGrid = document.getElementById('screenGrid');
const videoGrid = document.getElementById('videoGrid');

// ស្តាប់សញ្ញាពី Server ពេលមានអ្នកចេញចូលបន្ទប់ណាមួយ ដើម្បី Update តារាង Admin
socket.on('rooms-update', () => {
  if (currentUserRole === 'admin' && !document.getElementById('admin-dashboard').classList.contains('hidden')) {
    loadAdminRoomMonitor();
  }
});

// Click Fullscreen
function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}
localVideo.onclick = () => makeFullscreen(localVideo);

// ================= ADMIN FUNCTIONS =================
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

    if (select) select.innerHTML = '';
    if (adminSelect) adminSelect.innerHTML = '';

    data.rooms.forEach(r => {
      if (select) select.innerHTML += `<option value="${r}">${r}</option>`;
      if (adminSelect) adminSelect.innerHTML += `<option value="${r}">${r}</option>`;
    });
  } catch (err) {
    console.error('Error fetching rooms:', err);
  }
}
window.onload = loadRooms;

async function loadAdminRoomMonitor() {
  try {
    const res = await fetch('/api/rooms-status');
    const data = await res.json();
    const container = document.getElementById('activeRoomsList');
    container.innerHTML = '';

    data.rooms.forEach(room => {
      const isLive = room.userCount > 0;
      const statusHtml = isLive 
        ? `<span style="color:#10b981; font-weight:bold;">🟢 កំពុងសកម្ម (${room.userCount} នាក់)</span><br><small style="color:#94a3b8;">👤 ${room.users.join(', ')}</small>`
        : `<span style="color:#64748b;">⚪ ទំនេរ (គ្មានមនុស្ស)</span>`;

      container.innerHTML += `
        <div class="room-card ${isLive ? 'live' : ''}">
          <h4 style="margin-bottom:6px;">បន្ទប់: ${room.roomId}</h4>
          <p style="font-size:13px; margin-bottom:12px;">${statusHtml}</p>
          <button onclick="adminJoinRoom('${room.roomId}')" class="btn-success" style="width:100%; font-size:13px;">
            🚪 ចូលរួមបន្ទប់នេះ
          </button>
        </div>
      `;
    });
  } catch (err) { console.error('Error loading rooms:', err); }
}

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    data.users.forEach(user => {
      const isBlocked = user.isBlocked;
      const statusText = isBlocked ? '<span style="color:#ef4444; font-weight:bold;">Blocked</span>' : '<span style="color:#10b981; font-weight:bold;">Active</span>';

      const adminActions = user.role === 'admin' ? '<span style="color:#64748b;">No actions</span>' : `
        <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${isBlocked ? 'Unblock' : 'Block'}</button>
        <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">ប្តូរបន្ទប់</button>
        <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
        <button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">លុប</button>
      `;

      tbody.innerHTML += `<tr><td><strong>${user.username}</strong></td><td>${user.role}</td><td>${user.assignedRoom}</td><td>${statusText}</td><td>${adminActions}</td></tr>`;
    });
  } catch (err) { console.error('Error loading user table:', err); }
}

async function toggleBlockUser(id) {
  try { const res = await fetch(`/api/users/${id}/toggle-block`, { method: 'PUT' }); const data = await res.json(); alert(data.message); await loadUsersTable(); } catch (err) {}
}
async function deleteUser(id, username) {
  if (!confirm(`តើអ្នកប្រាកដថាចង់លុប User "${username}" ទេ?`)) return;
  try { const res = await fetch(`/api/users/${id}`, { method: 'DELETE' }); const data = await res.json(); alert(data.message); await loadUsersTable(); } catch (err) {}
}
async function resetPassword(id, username) {
  const newPassword = prompt(`បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ${username}:`);
  if (!newPassword) return;
  try { const res = await fetch(`/api/users/${id}/reset-password`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword }) }); const data = await res.json(); alert(data.message); } catch (err) {}
}
async function editUserRoom(id, currentRoom) {
  const newRoom = prompt(`បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ${currentRoom}):\nជម្រើសបន្ទប់ដែលមាន: ${allRoomsList.join(', ')}`);
  if (!newRoom) return;
  try { const res = await fetch(`/api/users/${id}/edit-room`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newRoom }) }); const data = await res.json(); alert(data.message); await loadUsersTable(); } catch (err) {}
}
async function createNewUser() {
  const username = document.getElementById('newUsername').value.trim(); const password = document.getElementById('newPassword').value.trim(); const assignedRoom = document.getElementById('userAssignedRoomSelect').value;
  if (!username || !password) return alert('សូមបំពេញព័ត៌មាន!');
  try {
    const res = await fetch('/api/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, assignedRoom }) });
    const data = await res.json(); alert(data.message);
    if (data.success) { document.getElementById('newUsername').value = ''; document.getElementById('newPassword').value = ''; await loadUsersTable(); }
  } catch (err) {}
}
async function createNewRoom() {
  const roomId = document.getElementById('newRoomId').value.trim();
  if (!roomId) return alert('សូមបញ្ចូលឈ្មោះបន្ទប់!');
  try {
    const res = await fetch('/api/create-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId }) });
    const data = await res.json(); alert(data.message);
    if (data.success) { document.getElementById('newRoomId').value = ''; await loadRooms(); if (currentUserRole === 'admin') loadAdminRoomMonitor(); }
  } catch (err) {}
}

function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  document.getElementById('admin-dashboard').classList.add('hidden');
  startMeeting();
}

function logoutAdmin() {
  myUsername = ''; currentUserRole = ''; currentRoomId = ''; location.reload();
}
function logout() { logoutAdmin(); }

// ================= USER & AUTH FUNCTIONS =================

async function changeMyPassword() {
  const oldPwd = prompt('🔑 សូមបញ្ចូលលេខសម្ងាត់ចាស់របស់អ្នក:');
  if (!oldPwd) return;
  const newPwd = prompt('🔒 សូមបញ្ចូលលេខសម្ងាត់ថ្មី:');
  if (!newPwd) return;
  try {
    const res = await fetch('/api/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: myUsername, oldPassword: oldPwd, newPassword: newPwd }) });
    const data = await res.json(); alert(data.message);
  } catch (err) { alert('មានបញ្ហាក្នុងការប្តូរលេខសម្ងាត់!'); }
}

socket.on('receive-otp', (data) => {
  alert(`🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n\n🔐 នេះជាលេខកូដ 2FA របស់អ្នក៖ 【 ${data.otp} 】\n\n(សូមកុំប្រាប់លេខកូដនេះទៅអ្នកណាឱ្យសោះ!)`);
});

socket.on('admin-alert', (data) => {
  if (currentUserRole === 'admin') {
    alert(`🚨 សេចក្តីប្រកាសអាសន្នសុវត្ថិភាព!\n\nUser ឈ្មោះ "${data.username}" កំពុង Login លើឧបករណ៍ចំនួន ${data.count} ក្នុងពេលតែមួយ!`);
  }
});

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const roomId = document.getElementById('roomSelect').value;

  if (!username || !password) return alert('សូមបំពេញ Username និង Password!');
  pendingLoginData = { username, password, roomId };

  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingLoginData) });
    const data = await res.json();

    if (data.requires2FA) {
      alert(data.message);
      document.getElementById('otp-modal').classList.remove('hidden');
      return;
    }

    if (!data.success) return alert(data.message);
    finalizeLogin(data);
  } catch (err) { alert('មានបញ្ហាក្នុងការ Login!'); }
}

async function verify2FA() {
  const otp = document.getElementById('otpInput').value.trim();
  if (!otp) return alert('សូមវាយបញ្ចូលលេខកូដ!');

  try {
    const res = await fetch('/api/verify-2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pendingLoginData, otp }) });
    const data = await res.json();

    if (!data.success) return alert(data.message);
    document.getElementById('otp-modal').classList.add('hidden');
    finalizeLogin(data);
  } catch (err) { alert('លេខកូដមិនត្រឹមត្រូវទេ!'); }
}

function cancel2FA() {
  document.getElementById('otp-modal').classList.add('hidden');
  pendingLoginData = null;
}

function finalizeLogin(data) {
  myUsername = data.user.username;
  currentUserRole = data.user.role;
  currentRoomId = pendingLoginData.roomId;

  document.getElementById('mainBody').style.justifyContent = 'flex-start';
  document.getElementById('auth').classList.add('hidden');

  if (currentUserRole === 'admin') {
    socket.emit('register-admin'); // ឱ្យ Admin ចុះឈ្មោះទទួលសញ្ញា Update បន្ទប់
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadAdminRoomMonitor();
    loadUsersTable();
  } else {
    startMeeting();
  }
}

// ================= PRIVATE CHAT =================
function toggleChat() {
  document.getElementById('chat-panel').classList.toggle('hidden');
}

function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួល --</option>';
  for (let [peerId, name] of Object.entries(userNamesMap)) {
    select.innerHTML += `<option value="${peerId}">${name}</option>`;
  }
}

function sendPrivateMsg() {
  const toPeerId = document.getElementById('chatRecipientSelect').value;
  const msgInput = document.getElementById('chatInput');
  const message = msgInput.value.trim();

  if (!toPeerId || !message) return alert('សូមរើសអ្នកទទួល និងវាយសារជាមុនសិន!');

  socket.emit('private-message', { toPeerId, message });

  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item me"><b>To ${userNamesMap[toPeerId]}:</b><br>${message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  msgInput.value = '';
}

socket.on('receive-private-message', (data) => {
  document.getElementById('chat-panel').classList.remove('hidden'); 
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item"><b>From 👤 ${data.fromUsername}:</b><br>${data.message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

// ================= WEBRTC & PEERJS =================
function createActiveDummyVideoTrack() {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
  const ctx = canvas.getContext('2d'); let angle = 0;
  function draw() {
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(160 + Math.cos(angle) * 30, 120 + Math.sin(angle) * 20, 10, 0, Math.PI * 2); ctx.fill();
    angle += 0.08; dummyAnimFrame = requestAnimationFrame(draw);
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
    const dst = audioCtx.createMediaStreamDestination();
    audioTrack = dst.stream.getAudioTracks()[0];
    audioTrack.enabled = false;
    document.getElementById('micBtnIcon').innerHTML = '🔇';
    document.getElementById('micBtnIcon').classList.add('off');
  }

  localStream = new MediaStream([audioTrack, createActiveDummyVideoTrack()]);
  localVideo.srcObject = localStream;

  myPeer = new Peer(undefined, {
    host: location.hostname,
    port: location.port || (location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs',
    secure: location.protocol === 'https:',
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
  });

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId}`;
    socket.emit('join-room', currentRoomId, id, myUsername);
  });

  myPeer.on('call', (call) => {
    const callType = call.metadata ? call.metadata.type : 'camera';
    const callerName = call.metadata ? call.metadata.username : 'ដៃគូ';

    if (callType === 'screen') {
      call.answer();
      call.on('stream', (remoteScreenStream) => addRemoteScreenVideo(call.peer, remoteScreenStream, callerName));
      call.on('close', () => removeRemoteScreenVideo(call.peer));
    } else {
      call.answer(isCameraOn ? cameraStream : localStream);
      peerCalls[call.peer] = call;
      addRemoteVideo(call.peer, callerName);
      call.on('stream', (remoteStream) => {
        const videoEl = document.getElementById(`video-${call.peer}`);
        if (videoEl) { videoEl.srcObject = remoteStream; updateConnectionStatus(call.peer, '🟢 Online'); }
      });
      call.on('close', () => { delete peerCalls[call.peer]; updateConnectionStatus(call.peer, '🔴 Offline'); });
    }
  });

  // ហាមដាក់ Listener ក្រៅពី function ប្រសិនបើចង់ Add ក្នុងនេះ ត្រូវ Remove ចាស់ៗចោលសិន
  socket.off('existing-users');
  socket.off('user-joined');
  socket.off('user-left');

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

      if (isScreenSharing && screenStream) {
        setTimeout(() => myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } }), 1200);
      }
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
}

function connectToUser(peerId) {
  if (peerCalls[peerId]) return;
  const streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;
  try {
    const call = myPeer.call(peerId, streamToSend, { metadata: { type: 'camera', username: myUsername } });
    peerCalls[peerId] = call;
    updateConnectionStatus(peerId, '⏳ Connecting...');

    call.on('stream', (remoteStream) => {
      const videoEl = document.getElementById(`video-${peerId}`);
      if (videoEl) { videoEl.srcObject = remoteStream; updateConnectionStatus(peerId, '🟢 Online'); }
    });
    call.on('close', () => { delete peerCalls[peerId]; updateConnectionStatus(peerId, '🔴 Offline'); });
    call.on('error', () => { delete peerCalls[peerId]; updateConnectionStatus(peerId, '🔴 Offline'); });

    if (isScreenSharing && screenStream) myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
  } catch (err) { console.error('Error calling peer:', err); }
}

function updateConnectionStatus(peerId, status) {
  const statusElement = document.getElementById(`status-${peerId}`);
  if (statusElement) {
    statusElement.textContent = status;
    if (status.includes('🟢')) statusElement.style.color = '#10b981';
    else if (status.includes('🔴')) statusElement.style.color = '#ef4444';
    else statusElement.style.color = '#f59e0b';
  }
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;
  const container = document.createElement('div');
  container.className = 'video-box'; container.id = `video-container-${peerId}`;
  container.innerHTML = `
    <div class="name-tag">👤 ${username}</div>
    <div class="status-tag"><span id="status-${peerId}" style="color: #f59e0b;">⏳ Connecting...</span></div>
    <video id="video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>
  `;
  videoGrid.appendChild(container);
  const video = document.getElementById(`video-${peerId}`);
  if (video) video.onclick = () => makeFullscreen(video);
}

function removeRemoteVideo(peerId) {
  const container = document.getElementById(`video-container-${peerId}`);
  if (container) container.remove();
}

function addRemoteScreenVideo(peerId, stream, sharerName) {
  screenGrid.style.display = 'grid'; document.getElementById('screenTitle').style.display = 'block';
  let screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (!screenContainer) {
    screenContainer = document.createElement('div');
    screenContainer.className = 'video-box screen-box'; screenContainer.id = `screen-container-${peerId}`;
    screenContainer.innerHTML = `<div class="name-tag" style="background:#f59e0b; color:#000;">🖥️ អេក្រង់របស់: ${sharerName}</div><video id="screen-video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>`;
    screenGrid.appendChild(screenContainer);
  }
  const screenVideo = document.getElementById(`screen-video-${peerId}`);
  if (screenVideo) { screenVideo.srcObject = stream; screenVideo.onclick = () => makeFullscreen(screenVideo); }
}

function removeRemoteScreenVideo(peerId) {
  const screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (screenContainer) screenContainer.remove();
  if (screenGrid.children.length === 0) { screenGrid.style.display = 'none'; document.getElementById('screenTitle').style.display = 'none'; }
}

function updateUserCount() {
  const count = document.querySelectorAll('#videoGrid .video-box').length;
  document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

async function toggleCamera() {
  const camIcon = document.getElementById('camBtnIcon');
  if (isCameraOn) {
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
    isCameraOn = false; camIcon.innerHTML = '🚫'; camIcon.classList.add('off');
    const dummyTrack = localStream.getVideoTracks()[0];
    localVideo.srcObject = localStream; replaceVideoTrackToPeers(dummyTrack);
  } else {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
      const camTrack = cameraStream.getVideoTracks()[0];
      isCameraOn = true; camIcon.innerHTML = '🎥'; camIcon.classList.remove('off');
      localVideo.srcObject = cameraStream; replaceVideoTrackToPeers(camTrack);
      camTrack.onended = () => toggleCamera();
    } catch (err) { alert('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err.message); }
  }
}

function replaceVideoTrackToPeers(newVideoTrack) {
  for (const [peerId, call] of Object.entries(peerCalls)) {
    const pc = call.peerConnection; if (!pc) continue;
    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (videoSender && newVideoTrack) videoSender.replaceTrack(newVideoTrack);
  }
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return alert('⚠️ មុខងារ Share Screen អាចដំណើរការបានតែលើកុំព្យូទ័រ (Computer/Laptop) ប៉ុណ្ណោះ!');
  if (isScreenSharing) {
    stopScreenShare();
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      isScreenSharing = true;
      document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
      document.getElementById('screenBtn').className = 'btn-danger';

      addRemoteScreenVideo('my-local-screen', screenStream, myUsername + " (អ្នក)");
      for (const peerId of Object.keys(peerCalls)) myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
      screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { console.warn('Screen share canceled:', err); }
  }
}

function stopScreenShare() {
  if (!isScreenSharing) return;
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').className = 'btn-warning';
  removeRemoteScreenVideo('my-local-screen');
  if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); screenStream = null; }
}

function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  const micIcon = document.getElementById('micBtnIcon');
  audioTrack.enabled = !audioTrack.enabled;
  if (audioTrack.enabled) { micIcon.innerHTML = '🎤'; micIcon.classList.remove('off'); } 
  else { micIcon.innerHTML = '🔇'; micIcon.classList.add('off'); }
}

function leaveRoom() {
  if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame);
  if (isScreenSharing) stopScreenShare();
  if (isCameraOn && cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; isCameraOn = false;
    document.getElementById('camBtnIcon').innerHTML = '🚫'; document.getElementById('camBtnIcon').classList.add('off');
  }
  for (const [peerId, call] of Object.entries(peerCalls)) { call.close(); delete peerCalls[peerId]; }
  
  if (myPeer) myPeer.destroy();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  
  // លុប Listeners កុំឱ្យជាន់គ្នានៅពេលចុច Join ម្តងទៀត
  socket.off('existing-users');
  socket.off('user-joined');
  socket.off('user-left');
  
  socket.disconnect();

  document.getElementById('room-container').classList.add('hidden');

  if (currentUserRole === 'admin') {
    document.getElementById('admin-dashboard').classList.remove('hidden');
    document.getElementById('mainBody').style.justifyContent = 'flex-start';
    
    // ភ្ជាប់ Socket សារជាថ្មី និង Register Admin ឡើងវិញ
    socket.connect(); 
    socket.emit('register-admin'); 
    
    loadAdminRoomMonitor(); 
    loadUsersTable();
  } else {
    document.getElementById('mainBody').style.justifyContent = 'center';
    location.reload(); 
  }
}

// ============== SOUND NOTIFICATION ==============
function playNotificationSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'join') {
      // សំឡេងតឹង 1 ដង
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'leave') {
      // សំឡេងតឹងខ្លី
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    }
  } catch (e) {
    // Fallback: ប្រើ Web Audio API មិនបាន
    console.log('Sound notification not available');
  }
}

// ស្តាប់សំឡេងពី Server
socket.on('play-sound', (type) => {
  playNotificationSound(type);
});

// ============== REMOTE CONTROL FUNCTIONS ==============
let isRemoteControlActive = false;
let remoteControlTarget = null;
let remoteControlRequestId = null;
let isBeingControlled = false;

// សំណើរ Remote Control
function requestRemoteControl(targetId) {
  if (!currentUserRole === 'admin' && !currentUserRole === 'supervisor') {
    return alert('អ្នកគ្មានសិទ្ធិប្រើមុខងារ Remote Control ទេ!');
  }
  
  fetch('/api/remote-control/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      controllerId: myId,
      targetId: targetId,
      roomId: currentRoomId
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('កំពុងផ្ញើសំណើរ Remote Control... សូមរង់ចាំការអនុញ្ញាតពីម្ចាស់ Screen!');
      remoteControlRequestId = data.requestId;
    } else {
      alert('មិនអាចផ្ញើសំណើរបានទេ: ' + data.message);
    }
  });
}

// ទទួលសំណើរ Remote Control (សម្រាប់ target)
socket.on('remote-control-request', (data) => {
  if (data.targetId === myId) {
    const username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
    if (confirm(`${username} ចង់គ្រប់គ្រង Screen របស់អ្នកពីចម្ងាយ។ តើអ្នកអនុញ្ញាតទេ?`)) {
      // Approve
      fetch('/api/remote-control/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: data.requestId,
          targetId: myId
        })
      });
      isBeingControlled = true;
      alert('អ្នកបានអនុញ្ញាត Remote Control! អ្នកគ្រប់គ្រងអាចបញ្ជា Screen របស់អ្នកបាន។');
    } else {
      // Reject
      fetch('/api/remote-control/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: data.requestId })
      });
    }
  }
});

// Remote Control Approved (សម្រាប់ controller)
socket.on('remote-control-approved', (data) => {
  if (data.controllerId === myId) {
    alert('✅ Remote Control ត្រូវបានអនុញ្ញាត! អ្នកអាចគ្រប់គ្រង Screen ពីចម្ងាយបានហើយ។');
    isRemoteControlActive = true;
    remoteControlTarget = data.targetId;
    startRemoteControl();
  }
});

// Remote Control Rejected
socket.on('remote-control-rejected', (data) => {
  if (data.controllerId === myId) {
    alert('❌ Remote Control ត្រូវបានបដិសេធ!');
    isRemoteControlActive = false;
    remoteControlTarget = null;
  }
});

// Remote Control Ended
socket.on('remote-control-ended', (data) => {
  if (data.controllerId === myId) {
    alert('Remote Control បានបញ្ចប់!');
    isRemoteControlActive = false;
    remoteControlTarget = null;
    stopRemoteControl();
  }
  if (data.targetId === myId) {
    isBeingControlled = false;
    alert('Remote Control បានបញ្ចប់!');
  }
});

// ចាប់ផ្ដើម Remote Control (Mouse & Keyboard)
function startRemoteControl() {
  if (!isRemoteControlActive) return;
  
  document.addEventListener('mousemove', handleRemoteMouseMove);
  document.addEventListener('click', handleRemoteMouseClick);
  document.addEventListener('keydown', handleRemoteKeyboard);
  
  alert('🎯 Remote Control បានចាប់ផ្ដើម! អ្នកអាចប្រើ Mouse និង Keyboard ដើម្បីបញ្ជា Screen ចម្ងាយ។');
}

function stopRemoteControl() {
  document.removeEventListener('mousemove', handleRemoteMouseMove);
  document.removeEventListener('click', handleRemoteMouseClick);
  document.removeEventListener('keydown', handleRemoteKeyboard);
}

function handleRemoteMouseMove(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  
  // បញ្ជូនទីតាំង Mouse
  socket.emit('remote-mouse-move', {
    targetId: remoteControlTarget,
    x: event.clientX,
    y: event.clientY
  });
}

function handleRemoteMouseClick(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  
  socket.emit('remote-mouse-click', {
    targetId: remoteControlTarget,
    x: event.clientX,
    y: event.clientY
  });
}

function handleRemoteKeyboard(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  
  socket.emit('remote-keyboard', {
    targetId: remoteControlTarget,
    key: event.key
  });
}

// ទទួល Mouse/Keyboard Events (សម្រាប់ target)
socket.on('remote-mouse-move', (data) => {
  if (!isBeingControlled) return;
  // បង្ហាញទីតាំង Mouse នៅលើ Screen (បង្ហាញជា pointer)
  showRemotePointer(data.x, data.y);
});

socket.on('remote-mouse-click', (data) => {
  if (!isBeingControlled) return;
  // Simulate click
  const element = document.elementFromPoint(data.x, data.y);
  if (element) {
    element.click();
    // បង្ហាញ animation click
    showRemoteClick(data.x, data.y);
  }
});

socket.on('remote-keyboard', (data) => {
  if (!isBeingControlled) return;
  // Simulate keyboard input
  const activeElement = document.activeElement;
  if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
    const event = new KeyboardEvent('keydown', { key: data.key });
    activeElement.dispatchEvent(event);
  }
});

// បង្ហាញ Remote Pointer
let remotePointer = null;

function showRemotePointer(x, y) {
  if (!remotePointer) {
    remotePointer = document.createElement('div');
    remotePointer.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border: 2px solid red;
      border-radius: 50%;
      background: rgba(255, 0, 0, 0.3);
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      transition: left 0.05s, top 0.05s;
    `;
    document.body.appendChild(remotePointer);
  }
  remotePointer.style.left = x + 'px';
  remotePointer.style.top = y + 'px';
}

function showRemoteClick(x, y) {
  const clickEffect = document.createElement('div');
  clickEffect.style.cssText = `
    position: fixed;
    width: 30px;
    height: 30px;
    border: 3px solid #00ff00;
    border-radius: 50%;
    background: rgba(0, 255, 0, 0.2);
    pointer-events: none;
    z-index: 9999;
    transform: translate(-50%, -50%);
    animation: clickPulse 0.5s ease-out forwards;
  `;
  clickEffect.style.left = x + 'px';
  clickEffect.style.top = y + 'px';
  document.body.appendChild(clickEffect);
  
  // Remove after animation
  setTimeout(() => {
    if (clickEffect.parentNode) clickEffect.remove();
  }, 500);
}

// Add CSS animation for click effect
const style = document.createElement('style');
style.textContent = `
  @keyframes clickPulse {
    0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
  }
`;
document.head.appendChild(style);

// ============== UPDATE USER TABLE WITH ROLE ==============
// កែប្រែ function loadUsersTable() ដើម្បីបង្ហាញ Role និងប៊ូតុង Edit Role

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    data.users.forEach(user => {
      const isBlocked = user.isBlocked;
      const statusText = isBlocked ? '<span style="color:#ef4444; font-weight:bold;">Blocked</span>' : '<span style="color:#10b981; font-weight:bold;">Active</span>';

      let adminActions = '';
      
      if (user.role === 'admin') {
        adminActions = '<span style="color:#64748b;">មិនអាចកែប្រែបាន</span>';
      } else if (user.role === 'supervisor') {
        adminActions = `
          <button class="action-btn btn-secondary" onclick="editUserRole('${user.id}', 'user')">កែ Role → User</button>
          <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">ប្តូរបន្ទប់</button>
          <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
        `;
      } else {
        adminActions = `
          <button class="action-btn btn-secondary" onclick="editUserRole('${user.id}', 'supervisor')">កែ Role → Supervisor</button>
          <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${isBlocked ? 'Unblock' : 'Block'}</button>
          <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">ប្តូរបន្ទប់</button>
          <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
          <button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">លុប</button>
        `;
      }

      // ប្រសិនបើ user បច្ចុប្បន្នជា supervisor មិនអាចលុប ឬប្តូរ Role របស់ admin និង supervisor ដទៃ
      if (currentUserRole === 'supervisor') {
        if (user.role === 'admin' || user.role === 'supervisor') {
          adminActions = '<span style="color:#64748b;">មិនអាចកែប្រែបាន</span>';
        }
      }

      tbody.innerHTML += `
        <tr>
          <td><strong>${user.username}</strong></td>
          <td><span style="color: ${user.role === 'admin' ? '#f59e0b' : user.role === 'supervisor' ? '#48cae4' : '#10b981'}; font-weight:bold;">${user.role}</span></td>
          <td>${user.assignedRoom}</td>
          <td>${statusText}</td>
          <td>${adminActions}</td>
        </tr>
      `;
    });
  } catch (err) { console.error('Error loading user table:', err); }
}

// Edit User Role (Admin only)
async function editUserRole(id, newRole) {
  if (currentUserRole !== 'admin') {
    return alert('អ្នកគ្មានសិទ្ធិកែប្រែ Role ទេ!');
  }
  
  const confirmMsg = `តើអ្នកប្រាកដថាចង់ប្តូរ Role ទៅជា "${newRole}" ទេ?`;
  if (!confirm(confirmMsg)) return;
  
  try {
    const res = await fetch(`/api/users/${id}/edit-role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole })
    });
    const data = await res.json();
    alert(data.message);
    if (data.success) await loadUsersTable();
  } catch (err) {
    alert('មានបញ្ហាក្នុងការប្តូរ Role!');
  }
}

// ============== UPDATE CREATE USER ==============
async function createNewUser() {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value.trim();
  const assignedRoom = document.getElementById('userAssignedRoomSelect').value;
  const role = document.getElementById('newUserRoleSelect').value;
  
  if (!username || !password) return alert('សូមបំពេញព័ត៌មាន!');
  
  try {
    const res = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, assignedRoom, role })
    });
    const data = await res.json();
    alert(data.message);
    if (data.success) {
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
      await loadUsersTable();
    }
  } catch (err) {}
}

// ============== ADD REMOTE CONTROL BUTTON TO USER VIDEO ==============
// កែប្រែ addRemoteVideo function ដើម្បីបន្ថែមប៊ូតុង Remote Control

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;
  const container = document.createElement('div');
  container.className = 'video-box'; 
  container.id = `video-container-${peerId}`;
  
  let remoteButtonHtml = '';
  // បង្ហាញប៊ូតុង Remote Control សម្រាប់តែ Admin និង Supervisor
  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    remoteButtonHtml = `
      <button onclick="requestRemoteControl('${peerId}')" 
              style="position:absolute; bottom:70px; right:10px; z-index:50; 
                     background:#f59e0b; color:#000; border:none; border-radius:8px; 
                     padding:5px 10px; font-size:12px; cursor:pointer; font-weight:bold;">
        🖥️ Remote
      </button>
    `;
  }
  
  container.innerHTML = `
    <div class="name-tag">👤 ${username}</div>
    <div class="status-tag"><span id="status-${peerId}" style="color: #f59e0b;">⏳ Connecting...</span></div>
    <video id="video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>
    ${remoteButtonHtml}
  `;
  videoGrid.appendChild(container);
  const video = document.getElementById(`video-${peerId}`);
  if (video) video.onclick = () => makeFullscreen(video);
}

// កែប្រែ function toggleChat() ដើម្បីបិទ Remote Control ពេលចាកចេញពីបន្ទប់
function leaveRoom() {
  // បិទ Remote Control
  if (isRemoteControlActive) {
    fetch('/api/remote-control/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        controllerId: myId,
        targetId: remoteControlTarget
      })
    });
    stopRemoteControl();
    isRemoteControlActive = false;
    remoteControlTarget = null;
  }
  
  if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame);
  if (isScreenSharing) stopScreenShare();
  if (isCameraOn && cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    isCameraOn = false;
    document.getElementById('camBtnIcon').innerHTML = '🚫';
    document.getElementById('camBtnIcon').classList.add('off');
  }
  for (const [peerId, call] of Object.entries(peerCalls)) {
    call.close();
    delete peerCalls[peerId];
  }
  
  if (myPeer) myPeer.destroy();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  
  socket.off('existing-users');
  socket.off('user-joined');
  socket.off('user-left');
  socket.off('play-sound');
  socket.off('remote-control-request');
  socket.off('remote-control-approved');
  socket.off('remote-control-rejected');
  socket.off('remote-control-ended');
  socket.off('remote-mouse-move');
  socket.off('remote-mouse-click');
  socket.off('remote-keyboard');
  
  socket.disconnect();

  document.getElementById('room-container').classList.add('hidden');

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    document.getElementById('admin-dashboard').classList.remove('hidden');
    document.getElementById('mainBody').style.justifyContent = 'flex-start';
    
    socket.connect(); 
    socket.emit('register-admin'); 
    
    loadAdminRoomMonitor(); 
    loadUsersTable();
  } else {
    document.getElementById('mainBody').style.justifyContent = 'center';
    location.reload(); 
  }
}
