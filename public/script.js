// ============================================================
// 1. SOCKET & PEER INITIALIZATION
// ============================================================
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
let deferredPrompt = null;

const localVideo = document.getElementById('localVideo');
const screenGrid = document.getElementById('screenGrid');
const videoGrid = document.getElementById('videoGrid');

// ============================================================
// 2. REMOTE CONTROL VARIABLES
// ============================================================
let isRemoteControlActive = false;
let remoteControlTarget = null;
let remoteControlRequestId = null;
let isBeingControlled = false;
let remoteScreenStream = null;
let remoteControlData = null;

// ============================================================
// 3. SOCKET EVENT LISTENERS
// ============================================================

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
  alert(`🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n\n🔐 នេះជាលេខកូដ 2FA របស់អ្នក៖ 【 ${data.otp} 】`);
});

socket.on('admin-alert', (data) => {
  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    alert(`🚨 សេចក្តីប្រកាសអាសន្នសុវត្ថិភាព!\n\nUser ឈ្មោះ "${data.username}" កំពុង Login លើឧបករណ៍ចំនួន ${data.count} ក្នុងពេលតែមួយ!`);
  }
});

// ============================================================
// 4. REMOTE CONTROL SOCKET EVENTS
// ============================================================

socket.on('remote-control-request', (data) => {
  if (data.targetId === myId) {
    const username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
    remoteControlRequestId = data.requestId;
    remoteControlData = data;
    
    document.getElementById('remoteRequesterName').textContent = username;
    document.getElementById('remoteRequestPopup').classList.add('active');
    document.getElementById('remoteRequestLoading').style.display = 'none';
    document.getElementById('remoteApproveBtn').style.display = 'inline-block';
    document.getElementById('remoteRejectBtn').style.display = 'inline-block';
  }
});

socket.on('remote-control-approved', (data) => {
  if (data.controllerId === myId) {
    showToast('✅ Remote Control ត្រូវបានអនុញ្ញាត!', 'success');
    isRemoteControlActive = true;
    remoteControlTarget = data.targetId;
    openRemoteModal();
  }
});

socket.on('remote-control-rejected', (data) => {
  if (data.controllerId === myId) {
    showToast('❌ Remote Control ត្រូវបានបដិសេធ!', 'error');
    isRemoteControlActive = false;
    remoteControlTarget = null;
    document.getElementById('remoteStatusText').textContent = '❌ ត្រូវបានបដិសេធ';
  }
});

socket.on('remote-control-ended', (data) => {
  if (data.controllerId === myId) {
    showToast('Remote Control បានបញ្ចប់!', 'info');
    isRemoteControlActive = false;
    remoteControlTarget = null;
    closeRemoteModal();
  }
  if (data.targetId === myId) {
    isBeingControlled = false;
    document.getElementById('remoteControlOverlay').classList.remove('active');
    document.getElementById('remoteControlOverlay').style.display = 'none';
    stopScreenShareForRemote();
    showToast('Remote Control បានបញ្ចប់!', 'info');
  }
});

socket.on('remote-mouse-move', (data) => {
  if (!isBeingControlled) return;
  showRemotePointer(data.x, data.y);
});

socket.on('remote-mouse-click', (data) => {
  if (!isBeingControlled) return;
  
  const screenX = (data.x / 1920) * window.innerWidth;
  const screenY = (data.y / 1080) * window.innerHeight;
  
  const element = document.elementFromPoint(screenX, screenY);
  if (element) {
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: screenX,
      clientY: screenY
    });
    element.dispatchEvent(clickEvent);
    showRemoteClick(screenX, screenY);
  }
});

socket.on('remote-keyboard', (data) => {
  if (!isBeingControlled) return;
  
  const activeElement = document.activeElement;
  if (activeElement && (activeElement.tagName === 'INPUT' || 
                        activeElement.tagName === 'TEXTAREA' || 
                        activeElement.isContentEditable)) {
    const event = new KeyboardEvent('keydown', {
      key: data.key,
      code: data.code,
      ctrlKey: data.ctrlKey,
      shiftKey: data.shiftKey,
      altKey: data.altKey,
      metaKey: data.metaKey,
      bubbles: true
    });
    activeElement.dispatchEvent(event);
    
    if (data.key.length === 1 && !data.ctrlKey && !data.metaKey) {
      const inputEvent = new InputEvent('input', { bubbles: true });
      activeElement.dispatchEvent(inputEvent);
    }
  }
});

socket.on('remote-scroll', (data) => {
  if (!isBeingControlled) return;
  window.scrollBy({
    top: data.deltaY * 2,
    left: data.deltaX * 2,
    behavior: 'smooth'
  });
});

// ============================================================
// 5. PRIVATE CHAT
// ============================================================

socket.on('receive-private-message', (data) => {
  document.getElementById('chat-panel').classList.remove('hidden');
  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item"><b>From 👤 ${data.fromUsername}:</b><br>${data.message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

// ============================================================
// 6. USER JOIN/LEAVE EVENTS
// ============================================================

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

// ============================================================
// 7. SOUND NOTIFICATION
// ============================================================

function playNotificationSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'join') {
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'leave') {
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    }
  } catch (e) {
    console.log('Sound notification not available');
  }
}

// ============================================================
// 8. REMOTE CONTROL FUNCTIONS
// ============================================================

function requestRemoteControl(targetId) {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
    return showToast('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!', 'error');
  }
  
  const targetName = userNamesMap[targetId] || 'មិត្តភក្តិ';
  
  if (!confirm(`តើអ្នកចង់គ្រប់គ្រង Screen របស់ ${targetName} មែនទេ?`)) {
    return;
  }
  
  showToast('⏳ កំពុងផ្ញើសំណើរ Remote Control...', 'info');
  
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
      remoteControlRequestId = data.requestId;
      remoteControlTarget = targetId;
      showToast('📨 សំណើរត្រូវបានផ្ញើ! សូមរង់ចាំការអនុញ្ញាត...', 'info');
      document.getElementById('remoteStatusText').textContent = '⏳ កំពុងរង់ចាំការអនុញ្ញាត...';
    } else {
      showToast('❌ ' + data.message, 'error');
    }
  })
  .catch(err => {
    showToast('❌ មានបញ្ហាក្នុងការផ្ញើសំណើរ!', 'error');
  });
}

function approveRemoteControl() {
  document.getElementById('remoteApproveBtn').style.display = 'none';
  document.getElementById('remoteRejectBtn').style.display = 'none';
  document.getElementById('remoteRequestLoading').style.display = 'block';
  
  fetch('/api/remote-control/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: remoteControlRequestId,
      targetId: myId
    })
  })
  .then(res => res.json())
  .then(data => {
    document.getElementById('remoteRequestPopup').classList.remove('active');
    if (data.success) {
      isBeingControlled = true;
      showToast('✅ អ្នកបានអនុញ្ញាត Remote Control!', 'success');
      document.getElementById('remoteControlOverlay').classList.add('active');
      document.getElementById('remoteControlOverlay').style.display = 'block';
      startScreenShareForRemote();
    } else {
      showToast('❌ មានបញ្ហាក្នុងការអនុញ្ញាត!', 'error');
    }
  });
}

function rejectRemoteControl() {
  document.getElementById('remoteApproveBtn').style.display = 'none';
  document.getElementById('remoteRejectBtn').style.display = 'none';
  document.getElementById('remoteRequestLoading').style.display = 'block';
  
  fetch('/api/remote-control/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: remoteControlRequestId })
  })
  .then(() => {
    document.getElementById('remoteRequestPopup').classList.remove('active');
    showToast('❌ អ្នកបានបដិសេធ Remote Control!', 'error');
  });
}

async function startScreenShareForRemote() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { 
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
    
    remoteScreenStream = stream;
    
    if (myPeer && remoteControlData) {
      const call = myPeer.call(remoteControlData.controllerId, stream, {
        metadata: { type: 'remote-screen', username: myUsername }
      });
      
      call.on('close', () => {
        stopScreenShareForRemote();
      });
    }
    
    stream.getVideoTracks()[0].onended = () => {
      stopScreenShareForRemote();
    };
    
  } catch (err) {
    console.error('Screen share error:', err);
    showToast('❌ មិនអាចចែករំលែក Screen បានទេ!', 'error');
    isBeingControlled = false;
    document.getElementById('remoteControlOverlay').classList.remove('active');
    document.getElementById('remoteControlOverlay').style.display = 'none';
  }
}

function stopScreenShareForRemote() {
  if (remoteScreenStream) {
    remoteScreenStream.getTracks().forEach(track => track.stop());
    remoteScreenStream = null;
  }
  isBeingControlled = false;
  document.getElementById('remoteControlOverlay').classList.remove('active');
  document.getElementById('remoteControlOverlay').style.display = 'none';
}

function openRemoteModal() {
  const modal = document.getElementById('remoteControlModal');
  modal.classList.add('active');
  modal.style.display = 'flex';
  
  const targetName = userNamesMap[remoteControlTarget] || 'អ្នកប្រើ';
  document.getElementById('remoteControlUser').textContent = `កំពុងគ្រប់គ្រង: ${targetName}`;
  document.getElementById('remoteStatusText').textContent = '🟢 កំពុងភ្ជាប់...';
  
  startRemoteControlEvents();
}

function closeRemoteModal() {
  const modal = document.getElementById('remoteControlModal');
  modal.classList.remove('active');
  modal.style.display = 'none';
  
  if (isRemoteControlActive) {
    endRemoteControl();
  }
}

function endRemoteControl() {
  if (!isRemoteControlActive) return;
  
  fetch('/api/remote-control/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      controllerId: myId,
      targetId: remoteControlTarget
    })
  });
  
  isRemoteControlActive = false;
  remoteControlTarget = null;
  stopRemoteControlEvents();
  closeRemoteModal();
  showToast('Remote Control បានបញ្ចប់!', 'info');
}

function startRemoteControlEvents() {
  document.addEventListener('mousemove', handleRemoteMouseMove);
  document.addEventListener('mousedown', handleRemoteMouseDown);
  document.addEventListener('mouseup', handleRemoteMouseUp);
  document.addEventListener('keydown', handleRemoteKeyboard);
  document.addEventListener('wheel', handleRemoteWheel);
  
  document.getElementById('remoteStatusText').textContent = '🟢 កំពុងគ្រប់គ្រង...';
}

function stopRemoteControlEvents() {
  document.removeEventListener('mousemove', handleRemoteMouseMove);
  document.removeEventListener('mousedown', handleRemoteMouseDown);
  document.removeEventListener('mouseup', handleRemoteMouseUp);
  document.removeEventListener('keydown', handleRemoteKeyboard);
  document.removeEventListener('wheel', handleRemoteWheel);
}

function handleRemoteMouseMove(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  
  const video = document.getElementById('remoteScreenVideo');
  const rect = video.getBoundingClientRect();
  
  const x = ((event.clientX - rect.left) / rect.width) * 1920;
  const y = ((event.clientY - rect.top) / rect.height) * 1080;
  
  socket.emit('remote-mouse-move', {
    targetId: remoteControlTarget,
    x: Math.max(0, Math.min(1920, x)),
    y: Math.max(0, Math.min(1080, y))
  });
}

function handleRemoteMouseDown(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  
  const video = document.getElementById('remoteScreenVideo');
  const rect = video.getBoundingClientRect();
  
  const x = ((event.clientX - rect.left) / rect.width) * 1920;
  const y = ((event.clientY - rect.top) / rect.height) * 1080;
  
  socket.emit('remote-mouse-click', {
    targetId: remoteControlTarget,
    x: Math.max(0, Math.min(1920, x)),
    y: Math.max(0, Math.min(1080, y)),
    button: event.button
  });
}

function handleRemoteMouseUp(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  // Optional: handle mouse up
}

function handleRemoteKeyboard(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  if (event.key === 'Escape' || event.key === 'F12') return;
  
  socket.emit('remote-keyboard', {
    targetId: remoteControlTarget,
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey
  });
  
  event.preventDefault();
}

function handleRemoteWheel(event) {
  if (!isRemoteControlActive || !remoteControlTarget) return;
  
  socket.emit('remote-scroll', {
    targetId: remoteControlTarget,
    deltaY: event.deltaY,
    deltaX: event.deltaX
  });
  
  event.preventDefault();
}

function showRemotePointer(x, y) {
  const pointer = document.getElementById('remotePointer');
  const screenX = (x / 1920) * window.innerWidth;
  const screenY = (y / 1080) * window.innerHeight;
  
  pointer.style.left = screenX + 'px';
  pointer.style.top = screenY + 'px';
  pointer.classList.add('active');
}

function showRemoteClick(x, y) {
  const clickEffect = document.createElement('div');
  clickEffect.className = 'remote-click-effect';
  clickEffect.style.left = x + 'px';
  clickEffect.style.top = y + 'px';
  document.body.appendChild(clickEffect);
  
  setTimeout(() => {
    if (clickEffect.parentNode) clickEffect.remove();
  }, 600);
}

function showRemoteUserSelector() {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
    return showToast('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!', 'error');
  }
  
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8);
    z-index: 99998;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #1c2541;
    border-radius: 15px;
    padding: 30px;
    max-width: 400px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;
  
  let usersHtml = '<h3 style="color:#48cae4; margin-bottom:20px;">🖥️ ជ្រើសរើសអ្នកប្រើសម្រាប់ Remote</h3>';
  
  const users = Object.entries(userNamesMap).filter(([id, name]) => id !== myId);
  
  if (users.length === 0) {
    usersHtml += '<p style="color:#94a3b8;">គ្មានអ្នកប្រើផ្សេងទៀតក្នុងបន្ទប់ទេ!</p>';
  } else {
    users.forEach(([id, name]) => {
      usersHtml += `
        <button onclick="selectRemoteTarget('${id}')" style="
          display:block; width:100%; padding:12px 15px;
          margin:8px 0; background:#0b132b; border:1px solid #334155;
          border-radius:8px; color:white; cursor:pointer;
          text-align:left; font-size:14px;
          transition: all 0.2s;
        " onmouseover="this.style.borderColor='#48cae4'" onmouseout="this.style.borderColor='#334155'">
          👤 ${name}
        </button>
      `;
    });
  }
  
  usersHtml += `
    <button onclick="this.closest('div[style*=\"z-index: 99998\"]').remove()" style="
      display:block; width:100%; padding:10px; margin-top:15px;
      background:#ef4444; border:none; border-radius:8px;
      color:white; cursor:pointer; font-weight:bold;
    ">បិទ</button>
  `;
  
  modal.innerHTML = usersHtml;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

function selectRemoteTarget(targetId) {
  document.querySelector('div[style*="z-index: 99998"]')?.remove();
  requestRemoteControl(targetId);
}

// ============================================================
// 9. TOAST NOTIFICATION
// ============================================================

function showToast(message, type = 'info') {
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#48cae4',
    warning: '#f59e0b'
  };
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = colors[type] || '#48cae4';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================
// 10. ADMIN FUNCTIONS
// ============================================================

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

      let adminActions = '';
      
      if (user.role === 'admin') {
        adminActions = '<span style="color:#64748b;">មិនអាចកែប្រែបាន</span>';
      } else if (user.role === 'supervisor') {
        if (currentUserRole === 'admin') {
          adminActions = `
            <button class="action-btn btn-secondary" onclick="editUserRole('${user.id}', 'user')">កែ Role</button>
            <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">ប្តូរបន្ទប់</button>
            <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
          `;
        } else {
          adminActions = '<span style="color:#64748b;">មិនអាចកែប្រែបាន</span>';
        }
      } else {
        if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
          adminActions = `
            <button class="action-btn btn-secondary" onclick="editUserRole('${user.id}', 'supervisor')">កែ Role</button>
            <button class="action-btn ${isBlocked ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockUser('${user.id}')">${isBlocked ? 'Unblock' : 'Block'}</button>
            <button class="action-btn btn-secondary" onclick="editUserRoom('${user.id}', '${user.assignedRoom}')">ប្តូរបន្ទប់</button>
            <button class="action-btn" style="background:#0284c7; color:white;" onclick="resetPassword('${user.id}', '${user.username}')">Reset Pwd</button>
            ${currentUserRole === 'admin' ? `<button class="action-btn btn-danger" onclick="deleteUser('${user.id}', '${user.username}')">លុប</button>` : ''}
          `;
        }
      }

      const roleColor = user.role === 'admin' ? '#f59e0b' : user.role === 'supervisor' ? '#48cae4' : '#10b981';

      tbody.innerHTML += `
        <tr>
          <td><strong>${user.username}</strong></td>
          <td><span style="color: ${roleColor}; font-weight:bold;">${user.role}</span></td>
          <td>${user.assignedRoom}</td>
          <td>${statusText}</td>
          <td>${adminActions}</td>
        </tr>
      `;
    });
  } catch (err) { console.error('Error loading user table:', err); }
}

function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  document.getElementById('admin-dashboard').classList.add('hidden');
  startMeeting();
}

// ============================================================
// 11. ADMIN CRUD OPERATIONS
// ============================================================

async function toggleBlockUser(id) {
  try {
    const res = await fetch(`/api/users/${id}/toggle-block`, { method: 'PUT' });
    const data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
}

async function deleteUser(id, username) {
  if (!confirm(`តើអ្នកប្រាកដថាចង់លុប User "${username}" ទេ?`)) return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
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
    showToast(data.message, 'success');
  } catch (err) {}
}

async function editUserRoom(id, currentRoom) {
  const newRoom = prompt(`បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ${currentRoom}):\nជម្រើស: ${allRoomsList.join(', ')}`);
  if (!newRoom) return;
  try {
    const res = await fetch(`/api/users/${id}/edit-room`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRoom })
    });
    const data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
}

async function editUserRole(id, newRole) {
  if (currentUserRole !== 'admin') {
    return showToast('អ្នកគ្មានសិទ្ធិកែប្រែ Role ទេ!', 'error');
  }
  
  if (!confirm(`តើអ្នកប្រាកដថាចង់ប្តូរ Role ទៅជា "${newRole}" ទេ?`)) return;
  
  try {
    const res = await fetch(`/api/users/${id}/edit-role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole })
    });
    const data = await res.json();
    showToast(data.message, 'success');
    if (data.success) await loadUsersTable();
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការប្តូរ Role!', 'error');
  }
}

async function createNewUser() {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value.trim();
  const assignedRoom = document.getElementById('userAssignedRoomSelect').value;
  const role = document.getElementById('newUserRoleSelect').value;
  
  if (!username || !password) return showToast('សូមបំពេញព័ត៌មាន!', 'error');
  
  try {
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
      await loadUsersTable();
      await loadRooms();
    }
  } catch (err) {}
}

async function createNewRoom() {
  const roomId = document.getElementById('newRoomId').value.trim();
  if (!roomId) return showToast('សូមបញ្ចូលឈ្មោះបន្ទប់!', 'error');
  try {
    const res = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId })
    });
    const data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      document.getElementById('newRoomId').value = '';
      await loadRooms();
      if (currentUserRole === 'admin') loadAdminRoomMonitor();
    }
  } catch (err) {}
}

// ============================================================
// 12. AUTHENTICATION
// ============================================================

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
      showToast(data.message, 'warning');
      document.getElementById('otp-modal').classList.remove('hidden');
      return;
    }

    if (!data.success) return showToast(data.message, 'error');
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
      body: JSON.stringify({ ...pendingLoginData, otp })
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

  document.getElementById('mainBody').style.justifyContent = 'flex-start';
  document.getElementById('auth').classList.add('hidden');

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    socket.emit('register-admin');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    document.getElementById('adminRoleDisplay').textContent = currentUserRole;
    
    if (currentUserRole === 'admin') {
      document.getElementById('tabBtnNewRoom').style.display = 'inline-block';
    } else {
      document.getElementById('tabBtnNewRoom').style.display = 'none';
    }
    
    loadAdminRoomMonitor();
    loadUsersTable();
  } else {
    startMeeting();
  }
}

async function changeMyPassword() {
  const oldPwd = prompt('🔑 សូមបញ្ចូលលេខសម្ងាត់ចាស់របស់អ្នក:');
  if (!oldPwd) return;
  const newPwd = prompt('🔒 សូមបញ្ចូលលេខសម្ងាត់ថ្មី:');
  if (!newPwd) return;
  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: myUsername, oldPassword: oldPwd, newPassword: newPwd })
    });
    const data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការប្តូរលេខសម្ងាត់!', 'error');
  }
}

function logoutAdmin() {
  myUsername = '';
  currentUserRole = '';
  currentRoomId = '';
  location.reload();
}

// ============================================================
// 13. PRIVATE CHAT UI
// ============================================================

function toggleChat() {
  document.getElementById('chat-panel').classList.toggle('hidden');
}

function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួល --</option>';
  for (let [peerId, name] of Object.entries(userNamesMap)) {
    if (peerId !== myId) {
      select.innerHTML += `<option value="${peerId}">${name}</option>`;
    }
  }
}

function sendPrivateMsg() {
  const toPeerId = document.getElementById('chatRecipientSelect').value;
  const msgInput = document.getElementById('chatInput');
  const message = msgInput.value.trim();

  if (!toPeerId || !message) return showToast('សូមរើសអ្នកទទួល និងវាយសារជាមុនសិន!', 'error');

  socket.emit('private-message', { toPeerId, message });

  const chatMsgs = document.getElementById('chat-messages');
  chatMsgs.innerHTML += `<div class="msg-item me"><b>To ${userNamesMap[toPeerId]}:</b><br>${message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  msgInput.value = '';
}

// ============================================================
// 14. WEBRTC / PEERJS
// ============================================================

function createActiveDummyVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
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
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
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

    // Handle Remote Screen (controller receiving target's screen)
    if (callType === 'remote-screen') {
      call.answer();
      call.on('stream', (remoteStream) => {
        document.getElementById('remoteScreenVideo').srcObject = remoteStream;
        document.getElementById('remoteStatusText').textContent = '🟢 កំពុងភ្ជាប់...';
        
        if (!document.getElementById('remoteControlModal').classList.contains('active')) {
          openRemoteModal();
        }
      });
      call.on('close', () => {
        document.getElementById('remoteStatusText').textContent = '🔴 បានផ្តាច់';
        showToast('Remote Control បានបញ្ចប់!', 'info');
      });
      return;
    }

    // Handle Screen Share
    if (callType === 'screen') {
      call.answer();
      call.on('stream', (remoteScreenStream) => addRemoteScreenVideo(call.peer, remoteScreenStream, callerName));
      call.on('close', () => removeRemoteScreenVideo(call.peer));
      return;
    }

    // Handle Camera
    call.answer(isCameraOn ? cameraStream : localStream);
    peerCalls[call.peer] = call;
    addRemoteVideo(call.peer, callerName);
    call.on('stream', (remoteStream) => {
      const videoEl = document.getElementById(`video-${call.peer}`);
      if (videoEl) {
        videoEl.srcObject = remoteStream;
        updateConnectionStatus(call.peer, '🟢 Online');
      }
    });
    call.on('close', () => {
      delete peerCalls[call.peer];
      updateConnectionStatus(call.peer, '🔴 Offline');
    });
  });

  // Remove old listeners
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
      if (videoEl) {
        videoEl.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });
    call.on('close', () => {
      delete peerCalls[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });
    call.on('error', () => {
      delete peerCalls[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    if (isScreenSharing && screenStream) {
      myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
    }
  } catch (err) {
    console.error('Error calling peer:', err);
  }
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
  container.className = 'video-box';
  container.id = `video-container-${peerId}`;
  
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
  screenGrid.style.display = 'grid';
  document.getElementById('screenTitle').style.display = 'block';
  let screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (!screenContainer) {
    screenContainer = document.createElement('div');
    screenContainer.className = 'video-box screen-box';
    screenContainer.id = `screen-container-${peerId}`;
    screenContainer.innerHTML = `
      <div class="name-tag" style="background:#f59e0b; color:#000;">🖥️ អេក្រង់របស់: ${sharerName}</div>
      <video id="screen-video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>
    `;
    screenGrid.appendChild(screenContainer);
  }
  const screenVideo = document.getElementById(`screen-video-${peerId}`);
  if (screenVideo) {
    screenVideo.srcObject = stream;
    screenVideo.onclick = () => makeFullscreen(screenVideo);
  }
}

function removeRemoteScreenVideo(peerId) {
  const screenContainer = document.getElementById(`screen-container-${peerId}`);
  if (screenContainer) screenContainer.remove();
  if (screenGrid.children.length === 0) {
    screenGrid.style.display = 'none';
    document.getElementById('screenTitle').style.display = 'none';
  }
}

function updateUserCount() {
  const count = document.querySelectorAll('#videoGrid .video-box').length;
  document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

// ============================================================
// 15. MEDIA CONTROLS
// ============================================================

function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}

async function toggleCamera() {
  const camIcon = document.getElementById('camBtnIcon');
  if (isCameraOn) {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    isCameraOn = false;
    camIcon.innerHTML = '🚫';
    camIcon.classList.add('off');
    const dummyTrack = localStream.getVideoTracks()[0];
    localVideo.srcObject = localStream;
    replaceVideoTrackToPeers(dummyTrack);
  } else {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
      });
      const camTrack = cameraStream.getVideoTracks()[0];
      isCameraOn = true;
      camIcon.innerHTML = '🎥';
      camIcon.classList.remove('off');
      localVideo.srcObject = cameraStream;
      replaceVideoTrackToPeers(camTrack);
      camTrack.onended = () => toggleCamera();
    } catch (err) {
      showToast('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err.message, 'error');
    }
  }
}

function replaceVideoTrackToPeers(newVideoTrack) {
  for (const [peerId, call] of Object.entries(peerCalls)) {
    const pc = call.peerConnection;
    if (!pc) continue;
    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (videoSender && newVideoTrack) videoSender.replaceTrack(newVideoTrack);
  }
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    return showToast('⚠️ មុខងារ Share Screen អាចដំណើរការបានតែលើកុំព្យូទ័រប៉ុណ្ណោះ!', 'warning');
  }
  if (isScreenSharing) {
    stopScreenShare();
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      isScreenSharing = true;
      document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
      document.getElementById('screenBtn').className = 'btn-danger';

      addRemoteScreenVideo('my-local-screen', screenStream, myUsername + " (អ្នក)");
      for (const peerId of Object.keys(peerCalls)) {
        myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
      }
      screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) {
      console.warn('Screen share canceled:', err);
    }
  }
}

function stopScreenShare() {
  if (!isScreenSharing) return;
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').className = 'btn-warning';
  removeRemoteScreenVideo('my-local-screen');
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
}

function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return showToast('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!', 'error');
  const micIcon = document.getElementById('micBtnIcon');
  audioTrack.enabled = !audioTrack.enabled;
  if (audioTrack.enabled) {
    micIcon.innerHTML = '🎤';
    micIcon.classList.remove('off');
  } else {
    micIcon.innerHTML = '🔇';
    micIcon.classList.add('off');
  }
}

function leaveRoom() {
  if (isRemoteControlActive) {
    fetch('/api/remote-control/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        controllerId: myId,
        targetId: remoteControlTarget
      })
    });
    stopRemoteControlEvents();
    isRemoteControlActive = false;
    remoteControlTarget = null;
    closeRemoteModal();
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
  socket.off('remote-scroll');
  
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

// ============================================================
// 16. PWA - INSTALL APP
// ============================================================

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('adminInstallBtn').style.display = 'inline-block';
});

window.addEventListener('appinstalled', () => {
  document.getElementById('adminInstallBtn').style.display = 'none';
});

function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        document.getElementById('adminInstallBtn').style.display = 'none';
      }
      deferredPrompt = null;
    });
  }
}

// ============================================================
// 17. INITIALIZATION
// ============================================================

window.onload = loadRooms;
localVideo.onclick = () => makeFullscreen(localVideo);

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registration successful');
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}
