const socket = io();
let myPeer;
let myId = '';
let myUsername = '';
let currentUserRole = '';
let currentRoomId = '';
let localStream = null;
const peerConnections = {};

let isCameraOn = false;
let isScreenSharing = false;
let screenStream = null;
let cameraStream = null;
let dummyCanvasInterval = null;
let allRoomsList = [];

const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideos');
const screenShareIndicator = document.getElementById('screenShareIndicator');

function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}

localVideo.onclick = () => makeFullscreen(localVideo);

function switchAdminTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tabs button').forEach(el => el.classList.remove('active'));

  if (tab === 'rooms') {
    document.getElementById('tab-rooms').classList.add('active');
    document.getElementById('tabBtnRooms').classList.add('active');
    loadAdminRoomMonitor();
  } else if (tab === 'users') {
    document.getElementById('tab-users').classList.add('active');
    document.getElementById('tabBtnUsers').classList.add('active');
    loadUsersTable();
  } else if (tab === 'newRoom') {
    document.getElementById('tab-newRoom').classList.add('active');
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
  } catch (err) {
    console.error('Error loading rooms:', err);
  }
}

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    data.users.forEach(user => {
      const isBlocked = user.isBlocked;
      const statusText = isBlocked 
        ? '<span style="color:#ef4444; font-weight:bold;">Blocked</span>' 
        : '<span style="color:#10b981; font-weight:bold;">Active</span>';
      
      const adminActions = user.role === 'admin' ? '<span style="color:#64748b;">No actions</span>' : `
        <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser(${user.id})">
          ${isBlocked ? 'Unblock' : 'Block'}
        </button>
        <button class="action-btn btn-secondary" onclick="editUserRoom(${user.id}, '${user.assignedRoom}')">
          ប្តូរបន្ទប់
        </button>
        <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword(${user.id}, '${user.username}')">
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
    console.error('Error loading user table:', err);
  }
}

async function toggleBlockUser(id) {
  try {
    const res = await fetch(`/api/users/${id}/toggle-block`, { method: 'PUT' });
    const data = await res.json();
    alert(data.message);
    await loadUsersTable();
  } catch (err) {
    console.error(err);
  }
}

async function deleteUser(id, username) {
  if (!confirm(`តើអ្នកប្រាកដថាចង់លុប User "${username}" ទេ?`)) return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    await loadUsersTable();
  } catch (err) {
    console.error(err);
  }
}

async function resetPassword(id, username) {
  const newPassword = prompt(`បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ${username}:`);
  if (!newPassword) return;

  try {
    const res = await fetch(`/api/users/${id}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    alert(data.message);
  } catch (err) {
    console.error(err);
  }
}

async function editUserRoom(id, currentRoom) {
  const newRoom = prompt(`បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ${currentRoom}):\nជម្រើសបន្ទប់ដែលមាន: ${allRoomsList.join(', ')}`);
  if (!newRoom) return;

  try {
    const res = await fetch(`/api/users/${id}/edit-room`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRoom })
    });
    const data = await res.json();
    alert(data.message);
    await loadUsersTable();
  } catch (err) {
    console.error(err);
  }
}

// បង្កើត Dummy Media Stream ឱ្យមាន Animation ស្រាល ដើម្បីឱ្យ PeerJS មិនគាំង
function createDummyMediaStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');

  if (dummyCanvasInterval) clearInterval(dummyCanvasInterval);
  dummyCanvasInterval = setInterval(() => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, 1000);

  const videoStream = canvas.captureStream(5);
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
  if (isScreenSharing && screenStream) return screenStream;
  if (isCameraOn && cameraStream) return cameraStream;
  return localStream;
}

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
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
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

  try {
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
      }
    }
  } catch (err) {
    console.error('Error creating room:', err);
    alert('មានបញ្ហាក្នុងការបង្កើតបន្ទប់!');
  }
}

async function startMeeting() {
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const dummy = createDummyMediaStream();
    localStream = new MediaStream([audioStream.getAudioTracks()[0], dummy.getVideoTracks()[0]]);
  } catch {
    console.log('ដំណើរការដោយគ្មាន Mic');
    localStream = createDummyMediaStream();
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
        setTimeout(() => connectToUser(user.peerId), 600);
      }
    });
    updateUserCount();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    if (peerId !== myId) {
      addRemoteVideo(peerId, username);
      setTimeout(() => connectToUser(peerId), 600);
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
      statusElement.style.color = '#10b981';
    } else if (status.includes('🔴')) {
      statusElement.style.color = '#ef4444';
    } else {
      statusElement.style.color = '#f59e0b';
    }
  }
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;

  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `video-container-${peerId}`;
  
  container.innerHTML = `
    <p style="margin-bottom:8px;"><strong>👤 ${username}</strong> 
      <span id="status-${peerId}" style="color: #f59e0b;">⏳ Connecting...</span>
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

// មុខងារ បើក/បិទ កាមេរ៉ា
async function toggleCamera() {
  const camBtn = document.getElementById('camBtn');
  
  if (isCameraOn) {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    isCameraOn = false;
    camBtn.innerHTML = '📷 បើក កាមេរ៉ា';
    camBtn.className = 'btn-secondary';

    const dummyTrack = localStream.getVideoTracks()[0];
    localVideo.srcObject = localStream;
    replaceVideoTrackToPeers(dummyTrack);
  } else {
    try {
      if (isScreenSharing) await stopScreenShare();

      cameraStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      const camTrack = cameraStream.getVideoTracks()[0];
      
      isCameraOn = true;
      camBtn.innerHTML = '📷 បិទ កាមេរ៉ា';
      camBtn.className = 'btn-success';

      localVideo.srcObject = cameraStream;
      replaceVideoTrackToPeers(camTrack);

      camTrack.onended = () => {
        toggleCamera();
      };
    } catch (err) {
      alert('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err.message);
    }
  }
}

async function shareScreen() {
  try {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (isCameraOn) await toggleCamera();

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

    replaceVideoTrackToPeers(screenTrack);

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

  const fallbackTrack = localStream.getVideoTracks()[0];
  localVideo.srcObject = localStream;
  replaceVideoTrackToPeers(fallbackTrack);
}

function replaceVideoTrackToPeers(newVideoTrack) {
  for (const [peerId, call] of Object.entries(peerConnections)) {
    const pc = call.peerConnection;
    if (!pc) continue;

    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (videoSender && newVideoTrack) {
      videoSender.replaceTrack(newVideoTrack);
    }
  }
}

function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  }
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById('micBtn').innerHTML = audioTrack.enabled ? '🎤 បិទ/បើក មេក្រូ' : '🔇 បើក មេក្រូ';
  document.getElementById('micBtn').style.background = audioTrack.enabled ? '#10b981' : '#ef4444';
}

function leaveRoom() {
  if (dummyCanvasInterval) clearInterval(dummyCanvasInterval);
  if (isScreenSharing) stopScreenShare();
  if (isCameraOn && cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
  }
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
