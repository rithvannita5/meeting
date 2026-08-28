// ============================================================
// SOCKET.IO CONNECTION - Polling Only (No WebSocket)
// ============================================================
let socket = null;
let socketConnected = false;
let connectionAttempts = 0;

// ============================================================
// PEER & STREAM VARIABLES
// ============================================================
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

// ============================================================
// REMOTE CONTROL VARIABLES
// ============================================================
let isRemoteControlActive = false;
let remoteControlTarget = null;
let remoteControlRequestId = null;
let isBeingControlled = false;
let remotePointer = null;

// ============================================================
// CHAT NOTIFICATION VARIABLES
// ============================================================
let unreadChats = {};
let isChatOpen = false;
let autoReplyEnabled = true;

// ============================================================
// SOCKET CONNECTION FUNCTION
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
    extraHeaders: {
      'X-Forwarded-Proto': 'https'
    }
  });

  // ============================================================
  // SOCKET EVENT HANDLERS
  // ============================================================
  socket.on('connect_error', function(error) {
    console.log('❌ Socket.IO connection error:', error);
    connectionAttempts++;
    
    if (connectionAttempts > 5) {
      showToast('⚠️ កំពុងព្យាយាមភ្ជាប់ Server...', 'warning');
    }
  });

  socket.on('connect', function() {
    console.log('✅ Socket.IO connected successfully using Polling!');
    socketConnected = true;
    connectionAttempts = 0;
    showToast('✅ ភ្ជាប់ Server បានជោគជ័យ!', 'success');
  });

  socket.on('disconnect', function(reason) {
    console.log('🔌 Socket.IO disconnected:', reason);
    socketConnected = false;
    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });

  socket.on('reconnect_attempt', function(attempt) {
    console.log('🔄 Reconnect attempt ' + attempt);
  });

  socket.on('reconnect', function(attempt) {
    console.log('✅ Reconnected after ' + attempt + ' attempts');
    socketConnected = true;
  });

  socket.on('reconnect_failed', function() {
    console.log('❌ Reconnect failed');
    showToast('❌ មិនអាចភ្ជាប់ Server បានទេ!', 'error');
  });

  // ============================================================
  // ROOMS UPDATE
  // ============================================================
  socket.on('rooms-update', function() {
    if ((currentUserRole === 'admin' || currentUserRole === 'supervisor') && 
        !document.getElementById('admin-dashboard').classList.contains('hidden')) {
      loadAdminRoomMonitor();
    }
  });

  // ============================================================
  // SOUND NOTIFICATION
  // ============================================================
  socket.on('play-sound', function(type) {
    playNotificationSound(type);
  });

  // ============================================================
  // 2FA OTP
  // ============================================================
  socket.on('receive-otp', function(data) {
    alert('🚨 ព្រមាន៖ មានគេកំពុងព្យាយាម Login ចូលគណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n\n🔐 នេះជាលេខកូដ 2FA របស់អ្នក៖ 【 ' + data.otp + ' 】');
  });

  socket.on('admin-alert', function(data) {
    if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
      alert('🚨 សេចក្តីប្រកាសអាសន្នសុវត្ថិភាព!\n\nUser ឈ្មោះ "' + data.username + '" កំពុង Login លើឧបករណ៍ចំនួន ' + data.count + ' ក្នុងពេលតែមួយ!');
    }
  });

  // ============================================================
  // REMOTE CONTROL SOCKET EVENTS
  // ============================================================
  socket.on('remote-control-request', function(data) {
    if (data.targetId === myId) {
      var username = userNamesMap[data.controllerId] || 'មិត្តភក្តិ';
      if (confirm(username + ' ចង់គ្រប់គ្រង Screen របស់អ្នកពីចម្ងាយ។ តើអ្នកអនុញ្ញាតទេ?')) {
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

  socket.on('remote-control-approved', function(data) {
    if (data.controllerId === myId) {
      alert('✅ Remote Control ត្រូវបានអនុញ្ញាត! អ្នកអាចគ្រប់គ្រង Screen ពីចម្ងាយបានហើយ។');
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

  socket.on('remote-mouse-move', function(data) {
    if (!isBeingControlled) return;
    showRemotePointer(data.x, data.y);
  });

  socket.on('remote-mouse-click', function(data) {
    if (!isBeingControlled) return;
    var element = document.elementFromPoint(data.x, data.y);
    if (element) {
      element.click();
      showRemoteClick(data.x, data.y);
    }
  });

  socket.on('remote-keyboard', function(data) {
    if (!isBeingControlled) return;
    var activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
      var event = new KeyboardEvent('keydown', { key: data.key, bubbles: true });
      activeElement.dispatchEvent(event);
      if (data.key.length === 1) {
        var inputEvent = new InputEvent('input', { bubbles: true });
        activeElement.dispatchEvent(inputEvent);
      }
    }
  });

  // ============================================================
  // PRIVATE CHAT WITH NOTIFICATIONS
  // ============================================================
  socket.on('receive-private-message', function(data) {
    var chatMsgs = document.getElementById('chat-messages');
    chatMsgs.innerHTML += '<div class="msg-item"><b>From 👤 ' + data.fromUsername + ':</b><br>' + data.message + '</div>';
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
      setTimeout(function() {
        if (!isChatOpen && unreadChats[data.fromPeerId] && unreadChats[data.fromPeerId].count > 0) {
          toggleChat();
          document.getElementById('chatRecipientSelect').value = data.fromPeerId;
          showToast('💬 ' + data.fromUsername + ' បានផ្ញើសារមកអ្នក', 'info');
        }
      }, 3000);
    }
  });

  // ============================================================
  // USER JOIN/LEAVE EVENTS
  // ============================================================
  socket.on('existing-users', function(users) {
    users.forEach(function(user, index) {
      userNamesMap[user.peerId] = user.username;
      addRemoteVideo(user.peerId, user.username);
      setTimeout(function() {
        connectToUser(user.peerId);
      }, (index + 1) * 500);
    });
    updateUserCount();
    updateChatUserList();
  });

  socket.on('user-joined', function(data) {
    var peerId = data.peerId;
    var username = data.username;
    if (peerId !== myId) {
      userNamesMap[peerId] = username;
      addRemoteVideo(peerId, username);
      updateUserCount();
      updateChatUserList();

      if (isScreenSharing && screenStream) {
        setTimeout(function() {
          myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
        }, 1200);
      }
    }
  });

  socket.on('user-left', function(peerId) {
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    if (peerCalls[peerId]) {
      peerCalls[peerId].close();
      delete peerCalls[peerId];
    }
    delete userNamesMap[peerId];
    updateUserCount();
    updateChatUserList();
  });
}

// ============================================================
// SOUND NOTIFICATION
// ============================================================
function playNotificationSound(type) {
  try {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var oscillator = audioCtx.createOscillator();
    var gainNode = audioCtx.createGain();
    
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
      setTimeout(function() {
        var osc2 = audioCtx.createOscillator();
        var gain2 = audioCtx.createGain();
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
// CHAT NOTIFICATION FUNCTIONS
// ============================================================
function updateChatBadge() {
  var badge = document.getElementById('chatBadgeCount');
  var totalUnread = 0;
  for (var key in unreadChats) {
    if (unreadChats.hasOwnProperty(key)) {
      totalUnread += unreadChats[key].count;
    }
  }
  
  if (totalUnread > 0) {
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    badge.style.display = 'inline-block';
    document.title = '(' + totalUnread + ') ប្រព័ន្ធ Video Conference';
  } else {
    badge.style.display = 'none';
    document.title = 'ប្រព័ន្ធ Video Conference';
  }
  
  if (navigator.setAppBadge) {
    if (totalUnread > 0) {
      navigator.setAppBadge(totalUnread)['catch'](function() {});
    } else {
      navigator.clearAppBadge()['catch'](function() {});
    }
  }
}

function showChatNotification(username, message, peerId) {
  var elements = document.querySelectorAll('.chat-notification[data-peer="' + peerId + '"]');
  elements.forEach(function(el) { el.remove(); });
  
  var notif = document.createElement('div');
  notif.className = 'chat-notification';
  notif.dataset.peer = peerId;
  notif.innerHTML = `
    <button class="close-notif" onclick="event.stopPropagation(); closeChatNotification(this.parentElement)">✕</button>
    <div class="sender">👤 ${username}</div>
    <div class="msg-preview">${message.length > 50 ? message.substring(0, 50) + '...' : message}</div>
    <div class="time">${new Date().toLocaleTimeString()}</div>
  `;
  
  notif.onclick = function() {
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
  
  setTimeout(function() {
    if (notif.parentNode) {
      notif.style.opacity = '0';
      notif.style.transition = 'opacity 0.3s';
      setTimeout(function() { notif.remove(); }, 300);
    }
  }, 10000);
  
  playNotificationSound('message');
}

function closeChatNotification(element) {
  element.style.opacity = '0';
  element.style.transition = 'opacity 0.3s';
  setTimeout(function() { element.remove(); }, 300);
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message, type) {
  if (type === undefined) type = 'info';
  var colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#48cae4',
    warning: '#f59e0b'
  };
  
  var toasts = document.querySelectorAll('.toast');
  toasts.forEach(function(el) { el.remove(); });
  
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.background = colors[type] || '#48cae4';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(function() { toast.remove(); }, 300);
  }, 4000);
}

// ============================================================
// REMOTE CONTROL FUNCTIONS
// ============================================================
function requestRemoteControl(targetId) {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
    alert('អ្នកគ្មានសិទ្ធិប្រើមុខងារ Remote Control ទេ!');
    return;
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
  .then(function(res) { return res.json(); })
  .then(function(data) {
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
  var clickEffect = document.createElement('div');
  clickEffect.className = 'click-effect';
  clickEffect.style.left = x + 'px';
  clickEffect.style.top = y + 'px';
  document.body.appendChild(clickEffect);
  setTimeout(function() {
    if (clickEffect.parentNode) clickEffect.remove();
  }, 500);
}

function showRemoteUserSelector() {
  if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
    alert('អ្នកគ្មានសិទ្ធិប្រើ Remote Control!');
    return;
  }
  
  var overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8);
    z-index: 99998;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  var modal = document.createElement('div');
  modal.style.cssText = `
    background: #1c2541;
    border-radius: 15px;
    padding: 30px;
    max-width: 400px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;
  
  var usersHtml = '<h3 style="color:#48cae4; margin-bottom:20px;">🖥️ ជ្រើសរើសអ្នកប្រើសម្រាប់ Remote</h3>';
  var users = [];
  for (var key in userNamesMap) {
    if (userNamesMap.hasOwnProperty(key) && key !== myId) {
      users.push({ id: key, name: userNamesMap[key] });
    }
  }
  
  if (users.length === 0) {
    usersHtml += '<p style="color:#94a3b8;">គ្មានអ្នកប្រើផ្សេងទៀតក្នុងបន្ទប់ទេ!</p>';
  } else {
    users.forEach(function(user) {
      usersHtml += `
        <button onclick="selectRemoteTarget('${user.id}')" style="
          display:block; width:100%; padding:12px 15px;
          margin:8px 0; background:#0b132b; border:1px solid #334155;
          border-radius:8px; color:white; cursor:pointer;
          text-align:left; font-size:14px;
          transition: all 0.2s;
        " onmouseover="this.style.borderColor='#48cae4'" onmouseout="this.style.borderColor='#334155'">
          👤 ${user.name}
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
  
  overlay.onclick = function(e) {
    if (e.target === overlay) overlay.remove();
  };
}

function selectRemoteTarget(targetId) {
  var selector = document.querySelector('div[style*="z-index: 99998"]');
  if (selector) selector.remove();
  requestRemoteControl(targetId);
}

// ============================================================
// ADMIN FUNCTIONS
// ============================================================
function switchAdminTab(tab) {
  var panes = document.querySelectorAll('.tab-pane');
  panes.forEach(function(el) { el.classList.add('hidden'); });
  
  var buttons = document.querySelectorAll('.nav-tabs button');
  buttons.forEach(function(el) { el.classList.remove('active'); });

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
    var res = await fetch('/api/rooms');
    var data = await res.json();
    allRoomsList = data.rooms;

    var select = document.getElementById('roomSelect');
    var adminSelect = document.getElementById('userAssignedRoomSelect');

    if (select) select.innerHTML = '';
    if (adminSelect) adminSelect.innerHTML = '';

    data.rooms.forEach(function(r) {
      if (select) select.innerHTML += '<option value="' + r + '">' + r + '</option>';
      if (adminSelect) adminSelect.innerHTML += '<option value="' + r + '">' + r + '</option>';
    });
  } catch (err) {
    console.error('Error fetching rooms:', err);
  }
}

async function loadAdminRoomMonitor() {
  try {
    var res = await fetch('/api/rooms-status');
    var data = await res.json();
    var container = document.getElementById('activeRoomsList');
    container.innerHTML = '';

    data.rooms.forEach(function(room) {
      var isLive = room.userCount > 0;
      var statusHtml = isLive 
        ? '<span style="color:#10b981; font-weight:bold;">🟢 កំពុងសកម្ម (' + room.userCount + ' នាក់)</span><br><small style="color:#94a3b8;">👤 ' + room.users.join(', ') + '</small>'
        : '<span style="color:#64748b;">⚪ ទំនេរ (គ្មានមនុស្ស)</span>';

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
    var res = await fetch('/api/users');
    var data = await res.json();
    var tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    data.users.forEach(function(user) {
      var isBlocked = user.isBlocked;
      var statusText = isBlocked ? '<span style="color:#ef4444; font-weight:bold;">Blocked</span>' : '<span style="color:#10b981; font-weight:bold;">Active</span>';

      var adminActions = '';
      
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

      var roleColor = user.role === 'admin' ? '#f59e0b' : user.role === 'supervisor' ? '#48cae4' : '#10b981';

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
  } catch (err) {
    console.error('Error loading user table:', err);
  }
}

function adminJoinRoom(roomId) {
  currentRoomId = roomId;
  document.getElementById('admin-dashboard').classList.add('hidden');
  startMeeting();
}

// ============================================================
// ADMIN CRUD OPERATIONS
// ============================================================
async function toggleBlockUser(id) {
  try {
    var res = await fetch('/api/users/' + id + '/toggle-block', { method: 'PUT' });
    var data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
}

async function deleteUser(id, username) {
  if (!confirm('តើអ្នកប្រាកដថាចង់លុប User "' + username + '" ទេ?')) return;
  try {
    var res = await fetch('/api/users/' + id, { method: 'DELETE' });
    var data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
}

async function resetPassword(id, username) {
  var newPassword = prompt('បញ្ចូលលេខសម្ងាត់ថ្មីសម្រាប់ ' + username + ':');
  if (!newPassword) return;
  try {
    var res = await fetch('/api/users/' + id + '/reset-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPassword })
    });
    var data = await res.json();
    showToast(data.message, 'success');
  } catch (err) {}
}

async function editUserRoom(id, currentRoom) {
  var newRoom = prompt('បញ្ចូលបន្ទប់ថ្មី (បន្ទប់បច្ចុប្បន្ន: ' + currentRoom + '):\nជម្រើស: ' + allRoomsList.join(', '));
  if (!newRoom) return;
  try {
    var res = await fetch('/api/users/' + id + '/edit-room', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRoom: newRoom })
    });
    var data = await res.json();
    showToast(data.message, 'success');
    await loadUsersTable();
  } catch (err) {}
}

async function editUserRole(id, newRole) {
  if (currentUserRole !== 'admin') {
    showToast('អ្នកគ្មានសិទ្ធិកែប្រែ Role ទេ!', 'error');
    return;
  }
  
  if (!confirm('តើអ្នកប្រាកដថាចង់ប្តូរ Role ទៅជា "' + newRole + '" ទេ?')) return;
  
  try {
    var res = await fetch('/api/users/' + id + '/edit-role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole: newRole })
    });
    var data = await res.json();
    showToast(data.message, 'success');
    if (data.success) await loadUsersTable();
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការប្តូរ Role!', 'error');
  }
}

async function createNewUser() {
  var username = document.getElementById('newUsername').value.trim();
  var password = document.getElementById('newPassword').value.trim();
  var assignedRoom = document.getElementById('userAssignedRoomSelect').value;
  var role = document.getElementById('newUserRoleSelect').value;
  
  if (!username || !password) {
    showToast('សូមបំពេញព័ត៌មាន!', 'error');
    return;
  }
  
  try {
    var res = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password, assignedRoom: assignedRoom, role: role })
    });
    var data = await res.json();
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
  var roomId = document.getElementById('newRoomId').value.trim();
  if (!roomId) {
    showToast('សូមបញ្ចូលឈ្មោះបន្ទប់!', 'error');
    return;
  }
  try {
    var res = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: roomId })
    });
    var data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      document.getElementById('newRoomId').value = '';
      await loadRooms();
      if (currentUserRole === 'admin') loadAdminRoomMonitor();
    }
  } catch (err) {}
}

// ============================================================
// AUTHENTICATION
// ============================================================
async function login() {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value.trim();
  var roomId = document.getElementById('roomSelect').value;

  if (!username || !password) {
    showToast('សូមបំពេញ Username និង Password!', 'error');
    return;
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
      showToast(data.message, 'error');
      return;
    }
    finalizeLogin(data);
  } catch (err) {
    showToast('មានបញ្ហាក្នុងការ Login!', 'error');
  }
}

async function verify2FA() {
  var otp = document.getElementById('otpInput').value.trim();
  if (!otp) {
    showToast('សូមវាយបញ្ចូលលេខកូដ!', 'error');
    return;
  }

  try {
    var res = await fetch('/api/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: pendingLoginData.username, password: pendingLoginData.password, otp: otp })
    });
    var data = await res.json();

    if (!data.success) {
      showToast(data.message, 'error');
      return;
    }
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
  var oldPwd = prompt('🔑 សូមបញ្ចូលលេខសម្ងាត់ចាស់របស់អ្នក:');
  if (!oldPwd) return;
  var newPwd = prompt('🔒 សូមបញ្ចូលលេខសម្ងាត់ថ្មី:');
  if (!newPwd) return;
  try {
    var res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: myUsername, oldPassword: oldPwd, newPassword: newPwd })
    });
    var data = await res.json();
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
// PRIVATE CHAT UI
// ============================================================
function toggleChat() {
  var panel = document.getElementById('chat-panel');
  isChatOpen = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  
  if (!panel.classList.contains('hidden')) {
    var selectedPeer = document.getElementById('chatRecipientSelect').value;
    if (selectedPeer && unreadChats[selectedPeer]) {
      unreadChats[selectedPeer].count = 0;
      updateChatBadge();
    }
    var notifications = document.querySelectorAll('.chat-notification');
    notifications.forEach(function(el) { el.remove(); });
  }
}

function updateChatUserList() {
  var select = document.getElementById('chatRecipientSelect');
  var currentValue = select.value;
  select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួល --</option>';
  
  for (var peerId in userNamesMap) {
    if (userNamesMap.hasOwnProperty(peerId) && peerId !== myId) {
      var name = userNamesMap[peerId];
      var unread = unreadChats[peerId] ? unreadChats[peerId].count : 0;
      var label = unread > 0 ? name + ' (' + unread + ' new)' : name;
      var selected = peerId === currentValue ? 'selected' : '';
      select.innerHTML += '<option value="' + peerId + '" ' + selected + '>' + label + '</option>';
    }
  }
}

function sendPrivateMsg() {
  var toPeerId = document.getElementById('chatRecipientSelect').value;
  var msgInput = document.getElementById('chatInput');
  var message = msgInput.value.trim();

  if (!toPeerId || !message) {
    showToast('សូមរើសអ្នកទទួល និងវាយសារជាមុនសិន!', 'error');
    return;
  }

  socket.emit('private-message', { toPeerId: toPeerId, message: message });

  var chatMsgs = document.getElementById('chat-messages');
  var targetName = userNamesMap[toPeerId] || 'មិត្តភក្តិ';
  chatMsgs.innerHTML += '<div class="msg-item me"><b>To ' + targetName + ':</b><br>' + message + '</div>';
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  msgInput.value = '';
  
  if (unreadChats[toPeerId]) {
    unreadChats[toPeerId].count = 0;
    updateChatBadge();
  }
}

// ============================================================
// WEBRTC / PEERJS
// ============================================================
function createActiveDummyVideoTrack() {
  var canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  var ctx = canvas.getContext('2d');
  var angle = 0;
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
  var audioTrack;
  try {
    var userMedia = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioTrack = userMedia.getAudioTracks()[0];
  } catch (e) {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var dst = audioCtx.createMediaStreamDestination();
    audioTrack = dst.stream.getAudioTracks()[0];
    audioTrack.enabled = false;
    document.getElementById('micBtnIcon').innerHTML = '🔇';
    document.getElementById('micBtnIcon').classList.add('off');
  }

  localStream = new MediaStream([audioTrack, createActiveDummyVideoTrack()]);
  localVideo.srcObject = localStream;

  // Use external PeerServer with TURN for cross-network
  myPeer = new Peer(undefined, {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
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
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    }
  });

  myPeer.on('open', function(id) {
    myId = id;
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = '👋 សួស្តី ' + myUsername + ' | បន្ទប់: ' + currentRoomId;
    socket.emit('join-room', currentRoomId, id, myUsername);
  });

  myPeer.on('call', function(call) {
    var callType = call.metadata ? call.metadata.type : 'camera';
    var callerName = call.metadata ? call.metadata.username : 'ដៃគូ';

    if (callType === 'screen') {
      call.answer();
      call.on('stream', function(remoteScreenStream) {
        addRemoteScreenVideo(call.peer, remoteScreenStream, callerName);
      });
      call.on('close', function() {
        removeRemoteScreenVideo(call.peer);
      });
    } else {
      call.answer(isCameraOn ? cameraStream : localStream);
      peerCalls[call.peer] = call;
      addRemoteVideo(call.peer, callerName);
      call.on('stream', function(remoteStream) {
        var videoEl = document.getElementById('video-' + call.peer);
        if (videoEl) {
          videoEl.srcObject = remoteStream;
          updateConnectionStatus(call.peer, '🟢 Online');
        }
      });
      call.on('close', function() {
        delete peerCalls[call.peer];
        updateConnectionStatus(call.peer, '🔴 Offline');
      });
    }
  });

  socket.off('existing-users');
  socket.off('user-joined');
  socket.off('user-left');

  socket.on('existing-users', function(users) {
    users.forEach(function(user, index) {
      userNamesMap[user.peerId] = user.username;
      addRemoteVideo(user.peerId, user.username);
      setTimeout(function() {
        connectToUser(user.peerId);
      }, (index + 1) * 500);
    });
    updateUserCount();
    updateChatUserList();
  });

  socket.on('user-joined', function(data) {
    var peerId = data.peerId;
    var username = data.username;
    if (peerId !== myId) {
      userNamesMap[peerId] = username;
      addRemoteVideo(peerId, username);
      updateUserCount();
      updateChatUserList();

      if (isScreenSharing && screenStream) {
        setTimeout(function() {
          myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
        }, 1200);
      }
    }
  });

  socket.on('user-left', function(peerId) {
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    if (peerCalls[peerId]) {
      peerCalls[peerId].close();
      delete peerCalls[peerId];
    }
    delete userNamesMap[peerId];
    updateUserCount();
    updateChatUserList();
  });
}

function connectToUser(peerId) {
  if (peerCalls[peerId]) return;
  var streamToSend = (isCameraOn && cameraStream) ? cameraStream : localStream;
  try {
    var call = myPeer.call(peerId, streamToSend, { metadata: { type: 'camera', username: myUsername } });
    peerCalls[peerId] = call;
    updateConnectionStatus(peerId, '⏳ Connecting...');

    call.on('stream', function(remoteStream) {
      var videoEl = document.getElementById('video-' + peerId);
      if (videoEl) {
        videoEl.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });
    call.on('close', function() {
      delete peerCalls[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });
    call.on('error', function() {
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
  var statusElement = document.getElementById('status-' + peerId);
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
  if (document.getElementById('video-container-' + peerId)) return;
  var container = document.createElement('div');
  container.className = 'video-box';
  container.id = 'video-container-' + peerId;
  
  var remoteButtonHtml = '';
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
  var video = document.getElementById('video-' + peerId);
  if (video) video.onclick = function() { makeFullscreen(video); };
}

function removeRemoteVideo(peerId) {
  var container = document.getElementById('video-container-' + peerId);
  if (container) container.remove();
}

function addRemoteScreenVideo(peerId, stream, sharerName) {
  screenGrid.style.display = 'grid';
  document.getElementById('screenTitle').style.display = 'block';
  var screenContainer = document.getElementById('screen-container-' + peerId);
  if (!screenContainer) {
    screenContainer = document.createElement('div');
    screenContainer.className = 'video-box screen-box';
    screenContainer.id = 'screen-container-' + peerId;
    screenContainer.innerHTML = `
      <div class="name-tag" style="background:#f59e0b; color:#000;">🖥️ អេក្រង់របស់: ${sharerName}</div>
      <video id="screen-video-${peerId}" autoplay playsinline title="ចុចដើម្បីមើលពេញអេក្រង់"></video>
    `;
    screenGrid.appendChild(screenContainer);
  }
  var screenVideo = document.getElementById('screen-video-' + peerId);
  if (screenVideo) {
    screenVideo.srcObject = stream;
    screenVideo.onclick = function() { makeFullscreen(screenVideo); };
  }
}

function removeRemoteScreenVideo(peerId) {
  var screenContainer = document.getElementById('screen-container-' + peerId);
  if (screenContainer) screenContainer.remove();
  if (screenGrid.children.length === 0) {
    screenGrid.style.display = 'none';
    document.getElementById('screenTitle').style.display = 'none';
  }
}

function updateUserCount() {
  var count = document.querySelectorAll('#videoGrid .video-box').length;
  document.getElementById('welcome-text').innerText = '👋 សួស្តី ' + myUsername + ' | បន្ទប់: ' + currentRoomId + ' | អ្នកប្រើ: ' + count;
}

// ============================================================
// MEDIA CONTROLS
// ============================================================
function makeFullscreen(elem) {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  }
}

async function toggleCamera() {
  var camIcon = document.getElementById('camBtnIcon');
  if (isCameraOn) {
    if (cameraStream) {
      cameraStream.getTracks().forEach(function(track) { track.stop(); });
      cameraStream = null;
    }
    isCameraOn = false;
    camIcon.innerHTML = '🚫';
    camIcon.classList.add('off');
    var dummyTrack = localStream.getVideoTracks()[0];
    localVideo.srcObject = localStream;
    replaceVideoTrackToPeers(dummyTrack);
  } else {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
      });
      var camTrack = cameraStream.getVideoTracks()[0];
      isCameraOn = true;
      camIcon.innerHTML = '🎥';
      camIcon.classList.remove('off');
      localVideo.srcObject = cameraStream;
      replaceVideoTrackToPeers(camTrack);
      camTrack.onended = function() { toggleCamera(); };
    } catch (err) {
      showToast('មិនអាចបើកកាមេរ៉ាបានទេ: ' + err.message, 'error');
    }
  }
}

function replaceVideoTrackToPeers(newVideoTrack) {
  for (var peerId in peerCalls) {
    if (peerCalls.hasOwnProperty(peerId)) {
      var call = peerCalls[peerId];
      var pc = call.peerConnection;
      if (!pc) continue;
      var videoSender = pc.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
      if (videoSender && newVideoTrack) videoSender.replaceTrack(newVideoTrack);
    }
  }
}

async function toggleScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    showToast('⚠️ មុខងារ Share Screen អាចដំណើរការបានតែលើកុំព្យូទ័រប៉ុណ្ណោះ!', 'warning');
    return;
  }
  if (isScreenSharing) {
    stopScreenShare();
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      isScreenSharing = true;
      document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
      document.getElementById('screenBtn').className = 'btn-danger';

      addRemoteScreenVideo('my-local-screen', screenStream, myUsername + ' (អ្នក)');
      for (var peerId in peerCalls) {
        if (peerCalls.hasOwnProperty(peerId)) {
          myPeer.call(peerId, screenStream, { metadata: { type: 'screen', username: myUsername } });
        }
      }
      screenStream.getVideoTracks()[0].onended = function() { stopScreenShare(); };
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
    screenStream.getTracks().forEach(function(track) { track.stop(); });
    screenStream = null;
  }
}

function toggleMic() {
  var audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    showToast('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!', 'error');
    return;
  }
  var micIcon = document.getElementById('micBtnIcon');
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
    stopRemoteControl();
    isRemoteControlActive = false;
    remoteControlTarget = null;
  }
  
  if (dummyAnimFrame) cancelAnimationFrame(dummyAnimFrame);
  if (isScreenSharing) stopScreenShare();
  if (isCameraOn && cameraStream) {
    cameraStream.getTracks().forEach(function(track) { track.stop(); });
    cameraStream = null;
    isCameraOn = false;
    document.getElementById('camBtnIcon').innerHTML = '🚫';
    document.getElementById('camBtnIcon').classList.add('off');
  }
  for (var peerId in peerCalls) {
    if (peerCalls.hasOwnProperty(peerId)) {
      peerCalls[peerId].close();
      delete peerCalls[peerId];
    }
  }
  
  if (myPeer) myPeer.destroy();
  if (localStream) localStream.getTracks().forEach(function(track) { track.stop(); });
  
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

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    toggleChat();
  }
  if (e.key === 'Escape' && isChatOpen) {
    toggleChat();
  }
});

// ============================================================
// INITIALIZATION
// ============================================================
connectSocket();
window.onload = loadRooms;
localVideo.onclick = function() { makeFullscreen(localVideo); };
autoReplyEnabled = true;
