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
const screenCalls = {}; // ✅ បន្ថែមសម្រាប់រក្សាទុក screen calls

let isCameraOn = false;
let isScreenSharing = false;
let dummyAnimFrame = null;
let allRoomsList = [];
let pendingLoginData = null;

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
let remotePointer = null;

// ============================================================
// 3. CHAT NOTIFICATION VARIABLES
// ============================================================
let unreadChats = {};
let isChatOpen = false;
let autoReplyEnabled = true;

// ============================================================
// 4. SCREEN SHARE FALLBACK VARIABLES
// ============================================================
let isScreenShareFallback = false;
let screenCaptureInterval = null;
let screenFallbackCanvas = null;
let screenFallbackImageCapture = null;
let screenFallbackVideo = null;
let screenFallbackLastSent = 0;
let screenFallbackAuto = false;
let screenFallbackStartedByUser = false;
const screenCallTimers = {};

// ============================================================
// 5. SOCKET EVENT LISTENERS
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
// 6. REMOTE CONTROL SOCKET EVENTS
// ============================================================

socket.on('remote-control-request', (data) => {
  if (data.targetId === myId) {
    const username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
    if (confirm(`${username} ចង់គ្រប់គ្រង Screen របស់អ្នកពីចម្ងាយ។ តើអ្នកអនុញ្ញាតទេ?`)) {
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
    alert('✅ Remote Control ត្រូវបានអនុញ្ញាត! អ្នកអាចគ្រប់គ្រង Screen ពីចម្ងាយបានហើយ។');
    isRemoteControlActive = true;
    remoteControlTarget = data.targetId;
    startRemoteControl();
  }
});

socket.on('remote-control-rejected', (data) => {
  if (data.controllerId === myId) {
    alert('❌ Remote Control ត្រូវបានបដិសេធ!');
    isRemoteControlActive = false;
    remoteControlTarget = null;
  }
});

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
    if (remotePointer) {
      remotePointer.remove();
      remotePointer = null;
    }
  }
});

socket.on('remote-mouse-move', (data) => {
  if (!isBeingControlled) return;
  showRemotePointer(data.x, data.y);
});

socket.on('remote-mouse-click', (data) => {
  if (!isBeingControlled) return;
  const element = document.elementFromPoint(data.x, data.y);
  if (element) {
    element.click();
    showRemoteClick(data.x, data.y);
  }
});

socket.on('remote-keyboard', (data) => {
  if (!isBeingControlled) return;
  const activeElement = document.activeElement;
  if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
    const event = new KeyboardEvent('keydown', { key: data.key, bubbles: true });
    activeElement.dispatchEvent(event);
    if (data.key.length === 1) {
      const inputEvent = new InputEvent('input', { bubbles: true });
      activeElement.dispatchEvent(inputEvent);
    }
  }
});

// ============================================================
// 7. PRIVATE CHAT WITH NOTIFICATIONS
// ============================================================

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
  
  if (!isChatOpen) {
    showChatNotification(data.fromUsername, data.message, data.fromPeerId);
  }
  
  updateChatUserList();
  
  if (autoReplyEnabled && !isChatOpen) {
    setTimeout(() => {
      if (!isChatOpen && unreadChats[data.fromPeerId]?.count > 0) {
        toggleChat();
        document.getElementById('chatRecipientSelect').value = data.fromPeerId;
        showToast(`💬 ${data.fromUsername} បានផ្ញើសារមកអ្នក`, 'info');
      }
    }, 3000);
  }
});

// ============================================================
// 8. USER JOIN/LEAVE EVENTS
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

    // ✅ ផ្ញើ screen stream ទៅកាន់ user ថ្មី
    if (isScreenSharing && screenStream) {
      setTimeout(() => {
        if (myPeer && screenStream) {
          try {
            const call = myPeer.call(peerId, screenStream, { 
              metadata: { type: 'screen', username: myUsername } 
            });
            screenCalls[peerId] = call;
            
            call.on('close', () => {
              delete screenCalls[peerId];
            });
            
            call.on('error', (err) => {
              console.error('Screen share error to new user:', err);
              delete screenCalls[peerId];
            });
            
            console.log('📺 Sent screen to new user:', peerId);
          } catch (err) {
            console.error('Failed to send screen to new user:', err);
          }
        }
      }, 1000);
    }
  }
});

socket.on('user-left', (peerId) => {
  removeRemoteVideo(peerId);
  removeRemoteScreenVideo(peerId);
  if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
  if (screenCalls[peerId]) { screenCalls[peerId].close(); delete screenCalls[peerId]; }
  delete userNamesMap[peerId];
  updateUserCount();
  updateChatUserList();
});

// ============================================================
// 9. SOUND NOTIFICATION
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
    } else if (type === 'message') {
      oscillator.frequency.value = 900;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.2;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.08);
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        gain2.gain.value = 0.2;
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.08);
      }, 150);
    }
  } catch (e) {
    console.log('Sound notification not available');
  }
}

// ============================================================
// 10. CHAT NOTIFICATION FUNCTIONS
// ============================================================

function updateChatBadge() {
  const badge = document.getElementById('chatBadgeCount');
  const totalUnread = Object.values(unreadChats).reduce((sum, u) => sum + u.count, 0);
  
  if (totalUnread > 0) {
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    badge.style.display = 'inline-block';
    document.title = `(${totalUnread}) ប្រព័ន្ធ Video Conference`;
  } else {
    badge.style.display = 'none';
    document.title = 'ប្រព័ន្ធ Video Conference';
  }
  
  if (navigator.setAppBadge) {
    if (totalUnread > 0) {
      navigator.setAppBadge(totalUnread).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }
}

function showChatNotification(username, message, peerId) {
  document.querySelectorAll(`.chat-notification[data-peer="${peerId}"]`).forEach(el => el.remove());
  
  const notif = document.createElement('div');
  notif.className = 'chat-notification';
  notif.dataset.peer = peerId;
  notif.innerHTML = `
    <button class="close-notif" onclick="event.stopPropagation(); closeChatNotification(this.parentElement)">✕</button>
    <div class="sender">👤 ${username}</div>
    <div class="msg-preview">${message.length > 50 ? message.substring(0, 50) + '...' : message}</div>
    <div class="time">${new Date().toLocaleTimeString()}</div>
  `;
  
  notif.onclick = () => {
    if (!isChatOpen) {
      toggleChat();
    }
    document.getElementById('chatRecipientSelect').value = peerId;
    if (unreadChats[peerId]) {
      unreadChats[peerId].count = 0;
      updateChatBadge();
    }
    notif.remove();
    document.getElementById('chatInput').focus();
  };
  
  document.body.appendChild(notif);
  
  setTimeout(() => {
    if (notif.parentNode) {
      notif.style.opacity = '0';
      notif.style.transition = 'opacity 0.3s';
      setTimeout(() => notif.remove(), 300);
    }
  }, 10000);
  
  playNotificationSound('message');
}

function closeChatNotification(element) {
  element.style.opacity = '0';
  element.style.transition = 'opacity 0.3s';
  setTimeout(() => element.remove(), 300);
}

// ============================================================
// 11. REMOTE CONTROL FUNCTIONS
// ============================================================

function requestRemoteControl(targetId) {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
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
  const clickEffect = document.createElement('div');
  clickEffect.className = 'click-effect';
  clickEffect.style.left = x + 'px';
  clickEffect.style.top = y + 'px';
  document.body.appendChild(clickEffect);
  setTimeout(() => {
    if (clickEffect.parentNode) clickEffect.remove();
  }, 500);
}

function showRemoteUserSelector() {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
    return alert('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!');
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
// 12. TOAST NOTIFICATION
// ============================================================

function showToast(message, type = 'info') {
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#48cae4',
    warning: '#f59e0b'
  };
  
  document.querySelectorAll('.toast').forEach(el => el.remove());
  
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
// 13. ADMIN FUNCTIONS
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
// 14. ADMIN CRUD OPERATIONS
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
// 15. AUTHENTICATION
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
// 16. PRIVATE CHAT UI
// ============================================================

function toggleChat() {
  const panel = document.getElementById('chat-panel');
  isChatOpen = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  
  if (!panel.classList.contains('hidden')) {
    const selectedPeer = document.getElementById('chatRecipientSelect').value;
    if (selectedPeer && unreadChats[selectedPeer]) {
      unreadChats[selectedPeer].count = 0;
      updateChatBadge();
    }
    document.querySelectorAll('.chat-notification').forEach(el => el.remove());
  }
}

function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  const currentValue = select.value;
  select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួល --</option>';
  
  for (let [peerId, name] of Object.entries(userNamesMap)) {
    if (peerId !== myId) {
      const unread = unreadChats[peerId]?.count || 0;
      const label = unread > 0 ? `${name} (${unread} new)` : name;
      select.innerHTML += `<option value="${peerId}" ${peerId === currentValue ? 'selected' : ''}>${label}</option>`;
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
  chatMsgs.innerHTML += `<div class="msg-item me"><b>To ${userNamesMap[toPeerId] || 'មិត្តភក្តិ'}:</b><br>${message}</div>`;
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  msgInput.value = '';
  
  if (unreadChats[toPeerId]) {
    unreadChats[toPeerId].count = 0;
    updateChatBadge();
  }
}

// ============================================================
// 17. WEBRTC / PEERJS
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

  // ========== WEBRTC / PEERJS ==========
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Optional TURN credentials supplied by Render environment variables.
  try {
    const turnRes = await fetch('/api/webrtc-config', { cache: 'no-store' });
    if (turnRes.ok) {
      const cfg = await turnRes.json();
      if (Array.isArray(cfg.iceServers)) iceServers.push(...cfg.iceServers);
    }
  } catch (e) {
    console.warn('TURN config unavailable; automatic Socket.IO screen fallback is enabled.');
  }

  myPeer = new Peer(undefined, {
    host: window.location.hostname,
    port: window.location.protocol === 'https:' ? 443 : 80,
    path: '/peerjs',
    secure: window.location.protocol === 'https:',
    config: {
      iceServers,
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    }
  });

  // Debug - Log connection status
  myPeer.on('connection', (conn) => {
    console.log('🔗 Peer connection established:', conn.peer);
  });

  myPeer.on('disconnected', () => {
    console.log('🔗 Peer disconnected');
    showToast('⚠️ Connection lost! Reconnecting...', 'warning');
  });

  myPeer.on('error', (err) => {
    console.error('🔗 Peer error:', err);
  });

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId}`;
    socket.emit('join-room', currentRoomId, id, myUsername);
    showToast('✅ Connected to Peer Server!', 'success');
  });

  // ========== FIXED: INCOMING CALL HANDLER ==========
  myPeer.on('call', (call) => {
    const callType = call.metadata ? call.metadata.type : 'camera';
    const callerName = call.metadata ? call.metadata.username : 'ដៃគូ';

    console.log('📞 Incoming call type:', callType, 'from:', callerName);

    // Handle Screen Share
    if (callType === 'screen') {
      console.log('📺 Receiving screen share from:', callerName);

      // Receive-only call: do not send camera/mic back.
      call.answer();

      let receivedScreen = false;
      const timer = setTimeout(() => {
        if (!receivedScreen) {
          console.warn('📺 Screen WebRTC is slow/blocked; sender fallback will handle it.');
        }
      }, 7000);

      call.on('stream', (remoteScreenStream) => {
        receivedScreen = true;
        clearTimeout(timer);
        console.log('📺 Screen stream received from:', callerName);
        addRemoteScreenVideo(call.peer, remoteScreenStream, callerName);
        showToast(`🖥️ ${callerName} កំពុងចែករំលែក Screen!`, 'info');
      });

      call.on('close', () => {
        clearTimeout(timer);
        removeRemoteScreenVideo(call.peer);
        delete screenCalls[call.peer];
      });

      call.on('error', (err) => {
        clearTimeout(timer);
        console.error('📺 Screen share error:', err);
        delete screenCalls[call.peer];
      });

      screenCalls[call.peer] = call;
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
    call.on('error', (err) => {
      console.error('Camera call error:', err);
      delete peerCalls[call.peer];
    });
  });

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

      // Send current screen to a newly joined user.
      if (isScreenSharing && screenStream) {
        setTimeout(() => sendScreenToPeer(peerId), 1000);
      }
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    if (peerCalls[peerId]) { peerCalls[peerId].close(); delete peerCalls[peerId]; }
    if (screenCalls[peerId]) { screenCalls[peerId].close(); delete screenCalls[peerId]; }
    delete userNamesMap[peerId];
    updateUserCount();
    updateChatUserList();
  });
}

function sendScreenToPeer(peerId) {
  if (!isScreenSharing || !screenStream || !myPeer || !peerId) return;

  if (screenCalls[peerId]) {
    try { screenCalls[peerId].close(); } catch (e) {}
    delete screenCalls[peerId];
  }

  try {
    const call = myPeer.call(peerId, screenStream, {
      metadata: { type: 'screen', username: myUsername }
    });
    screenCalls[peerId] = call;

    const timer = setTimeout(() => {
      if (screenCalls[peerId] === call && isScreenSharing) {
        console.warn('📺 Screen WebRTC timeout:', peerId);
        startAutomaticScreenFallback();
      }
    }, 7000);
    screenCallTimers[peerId] = timer;

    const pc = call.peerConnection;
    if (pc) {
      pc.addEventListener('iceconnectionstatechange', () => {
        const state = pc.iceConnectionState;
        console.log('📺 Screen ICE', peerId, state);
        if (state === 'failed' || state === 'disconnected') {
          startAutomaticScreenFallback();
        } else if (state === 'connected' || state === 'completed') {
          clearTimeout(timer);
          delete screenCallTimers[peerId];
        }
      });
    }

    call.on('stream', () => {
      clearTimeout(timer);
      delete screenCallTimers[peerId];
      console.log('📺 Screen WebRTC active:', peerId);
    });

    call.on('close', () => {
      clearTimeout(timer);
      delete screenCallTimers[peerId];
      delete screenCalls[peerId];
    });

    call.on('error', (err) => {
      clearTimeout(timer);
      delete screenCallTimers[peerId];
      delete screenCalls[peerId];
      console.error('📺 Screen WebRTC error:', peerId, err);
      if (isScreenSharing) startAutomaticScreenFallback();
    });
  } catch (err) {
    console.error('📺 Screen call failed:', peerId, err);
    startAutomaticScreenFallback();
  }
}

function startAutomaticScreenFallback() {
  if (!isScreenSharing || isScreenShareFallback || !screenStream) return;
  screenFallbackAuto = true;
  startSocketScreenFallbackFromExistingStream();
}

async function startSocketScreenFallbackFromExistingStream() {
  if (!isScreenSharing || !screenStream || isScreenShareFallback) return;

  isScreenShareFallback = true;
  document.getElementById('screenBtnFallback').innerHTML = '🛑 Auto Fallback';
  document.getElementById('screenBtnFallback').className = 'btn-danger';
  document.getElementById('screenBtn').style.display = 'none';

  if (!screenFallbackCanvas) screenFallbackCanvas = document.createElement('canvas');

  const track = screenStream.getVideoTracks()[0];
  try {
    screenFallbackImageCapture = ('ImageCapture' in window)
      ? new ImageCapture(track)
      : null;
  } catch (e) {
    screenFallbackImageCapture = null;
  }

  screenFallbackVideo = document.createElement('video');
  screenFallbackVideo.muted = true;
  screenFallbackVideo.playsInline = true;
  screenFallbackVideo.autoplay = true;
  screenFallbackVideo.srcObject = screenStream;
  try { await screenFallbackVideo.play(); } catch (e) {}

  clearInterval(screenCaptureInterval);
  screenCaptureInterval = setInterval(async () => {
    if (!isScreenShareFallback || !screenStream) return;

    const now = Date.now();
    if (now - screenFallbackLastSent < 250) return;
    screenFallbackLastSent = now;

    try {
      let bitmap = null;
      if (screenFallbackImageCapture) {
        bitmap = await screenFallbackImageCapture.grabFrame();
      }

      const canvas = screenFallbackCanvas;
      if (bitmap) {
        const scale = Math.min(1, 960 / bitmap.width, 540 / bitmap.height);
        canvas.width = Math.max(320, Math.floor(bitmap.width * scale));
        canvas.height = Math.max(180, Math.floor(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        if (bitmap.close) bitmap.close();
      } else if (screenFallbackVideo && screenFallbackVideo.readyState >= 2) {
        const w = screenFallbackVideo.videoWidth || 1280;
        const h = screenFallbackVideo.videoHeight || 720;
        const scale = Math.min(1, 960 / w, 540 / h);
        canvas.width = Math.max(320, Math.floor(w * scale));
        canvas.height = Math.max(180, Math.floor(h * scale));
        canvas.getContext('2d').drawImage(screenFallbackVideo, 0, 0, canvas.width, canvas.height);
      } else {
        return;
      }

      socket.emit('screen-data-fallback', {
        roomId: currentRoomId,
        fromPeerId: myId,
        screenData: canvas.toDataURL('image/jpeg', 0.55)
      });
    } catch (err) {
      console.error('📡 Fallback capture error:', err);
    }
  }, 250);
}

function connectToUser(peerId) {
  if (peerCalls[peerId]) return;
  const streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;
  try {
    // Send screen separately from camera.
    if (isScreenSharing && screenStream) {
      setTimeout(() => sendScreenToPeer(peerId), 500);
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
  
  let remoteButtonHtml = '';
  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    remoteButtonHtml = `
      <button class="remote-btn" onclick="requestRemoteControl('${peerId}')">
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
    screenVideo.play().catch(() => {});
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
// 18. SCREEN SHARE - FIXED
// ============================================================

async function toggleScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    return showToast('⚠️ មុខងារ Share Screen អាចដំណើរការបានតែលើកុំព្យូទ័រប៉ុណ្ណោះ!', 'warning');
  }
  
  if (isScreenSharing) {
    stopScreenShare();
    return;
  }
  
  try {
    // Request screen with audio
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: true
    });
    
    isScreenSharing = true;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').className = 'btn-danger';
    document.getElementById('screenBtnFallback').style.display = 'none';
    
    // Display locally
    addRemoteScreenVideo('my-local-screen', screenStream, myUsername + ' (អ្នក)');
    
    // Send to all peers
    const peerIds = Object.keys(peerCalls);
    if (peerIds.length === 0) {
      showToast('⏳ កំពុងរង់ចាំអ្នកប្រើផ្សេងទៀត...', 'info');
    }
    
    for (const peerId of peerIds) {
      sendScreenToPeer(peerId);
    }
    
    // Stop sharing when user clicks stop
    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };
    
    showToast('✅ កំពុងចែករំលែក Screen!', 'success');
    
  } catch (err) {
    console.error('Screen share error:', err);
    showToast('❌ មិនអាច Share Screen បានទេ: ' + err.message, 'error');
    document.getElementById('screenBtnFallback').style.display = 'inline-block';
  }
}

function stopScreenShare() {
  if (!isScreenSharing) return;
  
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').className = 'btn-warning';
  document.getElementById('screenBtnFallback').style.display = 'none';
  
  removeRemoteScreenVideo('my-local-screen');
  
  // Close all screen calls and timers.
  for (const [peerId, call] of Object.entries(screenCalls)) {
    try { call.close(); } catch (e) {}
    if (screenCallTimers[peerId]) clearTimeout(screenCallTimers[peerId]);
    delete screenCallTimers[peerId];
    delete screenCalls[peerId];
  }

  if (isScreenShareFallback) {
    stopScreenShareFallback();
  }

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  
  showToast('⏹️ បានបញ្ឈប់ Screen Share', 'info');
}

// ============================================================
// 19. SCREEN SHARE FALLBACK (Socket.IO)
// ============================================================

async function toggleScreenShareFallback() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    return showToast('⚠️ មុខងារ Share Screen អាចដំណើរការបានតែលើកុំព្យូទ័រប៉ុណ្ណោះ!', 'warning');
  }

  if (isScreenShareFallback) {
    screenFallbackStartedByUser = false;
    stopScreenShareFallback();
    return;
  }

  try {
    screenFallbackStartedByUser = true;
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15 } },
      audio: false
    });

    isScreenSharing = true;
    addRemoteScreenVideo('my-local-screen', screenStream, myUsername + ' (អ្នក)');
    await startSocketScreenFallbackFromExistingStream();
    document.getElementById('screenBtn').style.display = 'none';

    screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    showToast('✅ Fallback Screen Share started!', 'success');
  } catch (err) {
    screenFallbackStartedByUser = false;
    console.error('Fallback screen share error:', err);
    showToast('❌ មិនអាច Share Screen បានទេ!', 'error');
  }
}

function stopScreenShareFallback() {
  if (!isScreenShareFallback) return;

  isScreenShareFallback = false;
  clearInterval(screenCaptureInterval);
  screenCaptureInterval = null;
  screenFallbackImageCapture = null;
  screenFallbackVideo = null;

  document.getElementById('screenBtnFallback').innerHTML = '📡 Share (Fallback)';
  document.getElementById('screenBtnFallback').className = 'btn-secondary';
  document.getElementById('screenBtn').style.display = 'inline-block';

  removeRemoteScreenVideo('my-local-screen-fallback');

  socket.emit('stop-screen-fallback', {
    roomId: currentRoomId,
    fromPeerId: myId
  });
}

// Receive fallback as an image. This avoids creating a new MediaStream
// for every frame, which was unstable on the previous implementation.
socket.on('screen-data-fallback', (data) => {
  if (!data || data.fromPeerId === myId || !data.screenData) return;

  let screenContainer = document.getElementById(`screen-container-${data.fromPeerId}`);

  if (!screenContainer) {
    const sharerName = userNamesMap[data.fromPeerId] || 'មិត្តភក្តិ';
    screenGrid.style.display = 'grid';
    document.getElementById('screenTitle').style.display = 'block';

    screenContainer = document.createElement('div');
    screenContainer.className = 'video-box screen-box';
    screenContainer.id = `screen-container-${data.fromPeerId}`;
    screenContainer.innerHTML = `
      <div class="name-tag" style="background:#f59e0b; color:#000;">
        🖥️ អេក្រង់របស់: ${sharerName} (Fallback)
      </div>
      <img id="screen-image-${data.fromPeerId}" alt="Screen Share"
           style="width:100%;height:100%;object-fit:contain;display:block;background:#000;cursor:pointer;">
    `;
    screenGrid.appendChild(screenContainer);

    const img = document.getElementById(`screen-image-${data.fromPeerId}`);
    if (img) img.onclick = () => makeFullscreen(img);
  }

  const img = document.getElementById(`screen-image-${data.fromPeerId}`);
  if (img) img.src = data.screenData;
});

socket.on('stop-screen-fallback', (data) => {
  if (!data || data.fromPeerId === myId) return;
  removeRemoteScreenVideo(data.fromPeerId);
});
// ============================================================
// 20. MEDIA CONTROLS
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

// ============================================================
// 21. LEAVE ROOM
// ============================================================

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
    stopRemoteControl();
    isRemoteControlActive = false;
    remoteControlTarget = null;
  }
  
  if (isScreenShareFallback) {
    stopScreenShareFallback();
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
  for (const [peerId, call] of Object.entries(screenCalls)) {
    call.close();
    delete screenCalls[peerId];
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
  socket.off('screen-data-fallback');
  socket.off('stop-screen-fallback');
  
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
// 22. KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    toggleChat();
  }
  if (e.key === 'Escape' && isChatOpen) {
    toggleChat();
  }
});

// ============================================================
// 23. INITIALIZATION
// ============================================================

window.onload = loadRooms;
localVideo.onclick = () => makeFullscreen(localVideo);
autoReplyEnabled = true;
