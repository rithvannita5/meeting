const socket = io();
let myPeer;
let myId = '';
let myUsername = '';
let currentUserRole = '';
let currentRoomId = '';
let localStream = null;
const peerConnections = {};
let isScreenSharing = false;
let screenStream = null;
let allRoomsList = [];

const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideos');
const screenShareIndicator = document.getElementById('screenShareIndicator');

function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}

localVideo.onclick = () => makeFullscreen(localVideo);

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    allRoomsList = data.rooms;
    
    const select = document.getElementById('roomSelect');
    const adminSelect = document.getElementById('userAssignedRoomSelect');
    
    select.innerHTML = '';
    adminSelect.innerHTML = '';
    
    data.rooms.forEach(r => {
      select.innerHTML += `<option value="${r}">${r}</option>`;
      adminSelect.innerHTML += `<option value="${r}">${r}</option>`;
    });
  } catch (err) {
    console.error('Error fetching rooms:', err);
  }
}

window.onload = loadRooms;

// ទាញយកបន្ទប់សកម្មសម្រាប់ Admin
async function loadAdminRoomMonitor() {
  try {
    const res = await fetch('/api/rooms-status');
    const data = await res.json();
    const container = document.getElementById('activeRoomsList');
    container.innerHTML = '';

    data.rooms.forEach(room => {
      const isLive = room.userCount > 0;
      const badge = isLive 
        ? `<span class="badge-live">🟢 កំពុងសកម្ម (${room.userCount} នាក់: ${room.users.join(', ')})</span>`
        : `<span style="color:#aaa; font-size:12px;">⚪ ទំនេរ</span>`;

      container.innerHTML += `
        <div class="room-item">
          <div>
            <strong>បន្ទប់៖ ${room.roomId}</strong><br/>
            ${badge}
          </div>
          <button onclick="adminJoinRoom('${room.roomId}')" style="padding: 6px 12px; font-size: 12px; background: #28a745;">
            ចូលមើល (Join)
          </button>
        </div>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

// ផ្ទុកបញ្ជី User ទាំងអស់ចូលក្នុង Table
async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    data.users.forEach(user => {
      const isBlocked = user.isBlocked;
      const statusText = isBlocked ? '<span style="color:#dc3545; font-weight:bold;">Blocked</span>' : '<span style="color:#28a745; font-weight:bold;">Active</span>';
      
      const adminActions = user.role === 'admin' ? '<span style="color:#888;">No actions</span>' : `
        <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser(${user.id})">
          ${isBlocked ? 'Unblock' : 'Block'}
        </button>
        <button class="action-btn btn-secondary" onclick="editUserRoom(${user.id}, '${user.assignedRoom}')">
          ប្តូរបន្ទប់
        </button>
        <button class="action-btn" style="background:#17a2b8;" onclick="resetPassword(${user.id}, '${user.username}')">
          Reset Pwd
        </button>
        <button class="action-btn btn-danger" onclick="deleteUser(${user.id}, '${user.username}')">
          លុប
        </button>
      `;

      tbody.innerHTML += `
        <tr>
          <td><strong>${user.username}</strong></td>
          <td>${user.role}</td>
          <td>${user.assignedRoom}</td>
          <td>${statusText}</td>
          <td>${adminActions}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

// Block / Unblock User
async function toggleBlockUser(id) {
  const res = await fetch(`/api/users/${id}/toggle-block`, { method: 'PUT' });
  const data = await res.json();
  alert(data.message);
  loadUsersTable();
}

// Delete User
async function deleteUser(id, username) {
  if (!confirm(`តើអ្នកប្រាកដថាចង់លុប User "${username}" ទេ?`)) return;
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  alert(data.message);
  loadUsersTable();
}

// Reset Password
async function resetPassword(id, username) {
  const newPassword = prompt(`បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ${username}:`);
  if (!newPassword) return;

  const res = await fetch(`/api/users/${id}/reset-password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword })
  });
  const data = await res.json();
  alert(data.message);
}

// Edit User Room
async function editUserRoom(id, currentRoom) {
  const newRoom = prompt(`បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ${currentRoom}):\nជម្រើសបន្ទប់ដែលមាន: ${allRoomsList.join(', ')}`);
  if (!newRoom) return;

  const res = await fetch(`/api/users/${id}/edit-room`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newRoom })
  });
  const data = await res.json();
  alert(data.message);
  loadUsersTable();
}

function createDummyMediaStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const videoStream = canvas.captureStream(10);
  const videoTrack = videoStream.getVideoTracks()[0];

  const audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const dst = osc.connect(audioCtx.createMediaStreamDestination());
  osc.start();
  const audioTrack = dst.stream.getAudioTracks()[0];
  audioTrack.enabled = false;

  return new MediaStream([videoTrack, audioTrack]);
}

function getCurrentActiveStream() {
  return (isScreenSharing && screenStream) ? screenStream : localStream;
}

// Login
async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const roomId = document.getElementById('roomSelect').value;

  if (!username || !password) return alert('សូមបំពេញ Username និង Password!');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, roomId })
    });
    const data = await res.json();

    if (!data.success) {
      return alert(data.message);
    }

    myUsername = data.user.username;
    currentUserRole = data.user.role;
    currentRoomId = roomId;

    if (currentUserRole === 'admin') {
      document.getElementById('auth').classList.add('hidden');
      document.getElementById('admin-dashboard').classList.remove('hidden');
      loadAdminRoomMonitor();
      loadUsersTable();
    } else {
      startMeeting();
    }
  } catch (err) {
    alert('មានបញ្ហាក្នុងការ Login!');
  }
}

function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  document.getElementById('admin-dashboard').classList.add('hidden');
  startMeeting();
}

function logoutAdmin() {
  location.reload();
}

// Admin បង្កើត User ថ្មី
async function createNewUser() {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value.trim();
  const assignedRoom = document.getElementById('userAssignedRoomSelect').value;

  if (!username || !password) return alert('សូមបំពេញព័ត៌មាន!');

  try {
    const res = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, assignedRoom })
    });
    const data = await res.json();
    alert(data.message);

    if (data.success) {
      // សម្អាតប្រអប់បញ្ចូល
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
      
      // ទាញយក និងបង្ហាញបញ្ជី User ថ្មីក្នុង Table ភ្លាមៗ
      await loadUsersTable();
    }
  } catch (err) {
    console.error('Error creating user:', err);
    alert('មានបញ្ហាក្នុងការបង្កើត User!');
  }
}

async function createNewRoom() {
  const roomId = document.getElementById('newRoomId').value.trim();
  if (!roomId) return alert('សូមបញ្ចូលឈ្មោះបន្ទប់!');

  const res = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId })
  });
  const data = await res.json();
  alert(data.message);
  if (data.success) {
    document.getElementById('newRoomId').value = '';
    await loadRooms();
    if (currentUserRole === 'admin') {
      loadAdminRoomMonitor();
      loadUsersTable();
    }
  }
}

async function startMeeting() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch (err) {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const dummy = createDummyMediaStream();
      localStream = new MediaStream([audioStream.getAudioTracks()[0], dummy.getVideoTracks()[0]]);
    } catch {
      localStream = createDummyMediaStream();
    }
  }

  if (localStream) {
    localVideo.srcObject = localStream;
  }

  myPeer = new Peer({
    config: {
      iceServers: [
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
      ]
    },
    debug: 1
  });

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId}`;
    socket.emit('join-room', currentRoomId, id, myUsername);
  });

  myPeer.on('call', (call) => handleIncomingCall(call));

  socket.on('all-users', (users) => {
    users.forEach(user => {
      if (user.peerId !== myId) {
        addRemoteVideo(user.peerId, user.username);
        setTimeout(() => connectToUser(user.peerId), 500);
      }
    });
    updateUserCount();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    if (peerId !== myId) {
      addRemoteVideo(peerId, username);
      setTimeout(() => connectToUser(peerId), 500);
      updateUserCount();
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId);
    if (peerConnections[peerId]) {
      peerConnections[peerId].close();
      delete peerConnections[peerId];
    }
    updateUserCount();
  });
}

function connectToUser(peerId) {
  if (peerConnections[peerId]) return;
  const streamToSend = getCurrentActiveStream();

  try {
    const call = myPeer.call(peerId, streamToSend);
    peerConnections[peerId] = call;
    updateConnectionStatus(peerId, '⏳ Connecting...');

    call.on('stream', (remoteStream) => {
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });

    call.on('close', () => {
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    call.on('error', () => {
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

  } catch (err) {
    console.error('❌ Error calling peer:', err);
  }
}

function handleIncomingCall(call) {
  const peerId = call.peer;
  if (peerConnections[peerId]) return;

  peerConnections[peerId] = call;
  updateConnectionStatus(peerId, '⏳ Connecting...');
  const streamToSend = getCurrentActiveStream();

  try {
    call.answer(streamToSend);

    call.on('stream', (remoteStream) => {
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });

    call.on('close', () => {
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    call.on('error', () => {
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

  } catch (err) {
    console.error('❌ Error answering call:', err);
  }
}

function updateConnectionStatus(peerId, status) {
  const statusElement = document.getElementById(`status-${peerId}`);
  if (statusElement) {
    statusElement.textContent = status;
    if (status.includes('🟢')) {
      statusElement.style.color = '#28a745';
    } else if (status.includes('🔴')) {
      statusElement.style.color = '#dc3545';
    } else {
      statusElement.style.color = '#ffc107';
    }
  }
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;

  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `video-container-${peerId}`;
  
  container.innerHTML = `
    <p><strong>👤 ${username}</strong> 
      <span id="status-${peerId}" style="color: #ffc107;">⏳ Connecting...</span>
    </p>
    <video id="video-${peerId}" autoplay playsinline></video>
  `;
  
  remoteVideosContainer.appendChild(container);
  
  const video = document.getElementById(`video-${peerId}`);
  if (video) {
    video.onclick = () => makeFullscreen(video);
  }
}

function removeRemoteVideo(peerId) {
  const container = document.getElementById(`video-container-${peerId}`);
  if (container) container.remove();
}

function updateUserCount() {
  const count = Object.keys(peerConnections).length + 1;
  document.getElementById('welcome-text').innerText = 
    `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

async function shareScreen() {
  try {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: true,
      audio: true 
    });

    isScreenSharing = true;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').classList.add('screen-share-active');
    screenShareIndicator.style.display = 'block';

    localVideo.srcObject = screenStream;
    const screenTrack = screenStream.getVideoTracks()[0];

    for (const [peerId, call] of Object.entries(peerConnections)) {
      const pc = call.peerConnection;
      if (!pc) continue;

      const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }
    }

    screenTrack.onended = () => {
      stopScreenShare();
    };

  } catch (err) {
    console.error('❌ Error sharing screen:', err);
    stopScreenShare();
  }
}

async function stopScreenShare() {
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('screen-share-active');
  screenShareIndicator.style.display = 'none';

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  if (localStream) {
    localVideo.srcObject = localStream;
    const localVideoTrack = localStream.getVideoTracks()[0];

    for (const [peerId, call] of Object.entries(peerConnections)) {
      const pc = call.peerConnection;
      if (!pc) continue;

      const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender && localVideoTrack) {
        await videoSender.replaceTrack(localVideoTrack);
      }
    }
  }
}

function toggleMic() {
  if (!localStream || localStream.getAudioTracks().length === 0) {
    return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  }
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById('micBtn').innerHTML = audioTrack.enabled ? '🎤 បិទ/បើក មេក្រូ' : '🔇 បើក មេក្រូ';
  document.getElementById('micBtn').style.background = audioTrack.enabled ? '#28a745' : '#dc3545';
}

function leaveRoom() {
  if (isScreenSharing) stopScreenShare();
  for (const [peerId, call] of Object.entries(peerConnections)) call.close();
  if (myPeer) myPeer.destroy();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  socket.disconnect();

  if (currentUserRole === 'admin') {
    document.getElementById('room-container').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadAdminRoomMonitor();
    loadUsersTable();
  } else {
    location.reload();
  }
}
