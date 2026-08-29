// ============================================================
// SOCKET.IO CONNECTION - Polling Only (No WebSocket)
// ============================================================
let socket = null;
let socketConnected = false;
let connectionAttempts = 0;

// ============================================================
// PEER & STREAM VARIABLES
// ============================================================
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
    if (chatMsgs) {
      chatMsgs.innerHTML += '<div class="msg-item"><b>From 👤 ' + data.fromUsername + ':</b><br>' + data.message + '</div>';
      chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }
    
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
          var select = document.getElementById('chatRecipientSelect');
          if (select) select.value = data.fromPeerId;
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
  if (!badge) return;
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
    var select = document.getElementById('chatRecipientSelect');
    if (select) select.value = peerId;
    if (unreadChats[peerId]) {
      unreadChats[peerId].count = 0;
      updateChatBadge();
    }
    notif.remove();
    var input = document.getElementById('chatInput');
    if (input) input.focus();
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
    if (!container) return;
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
    if (!tbody) return;
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

  // ១. លាក់ Admin Dashboard
  var adminDash = document.getElementById('admin-dashboard');
  if (adminDash) adminDash.classList.add('hidden');

  // ២. បើកបង្ហាញ Meeting Container
  var meetingContainer = document.getElementById('meeting-container');
  if (meetingContainer) meetingContainer.classList.remove('hidden');

  // ៣. បង្ហាញឈ្មោះបន្ទប់នៅលើ Header
  var displayRoom = document.getElementById('displayRoomId');
  if (displayRoom) displayRoom.textContent = currentRoomId;

  // ៤. ដំណើរការ Dummy Stream និង PeerJS ដើម្បីភ្ជាប់ចូលបន្ទប់
  initDummyStream();

  if (myPeer && myPeer.id) {
    // ប្រសិនបើ Peer ភ្ជាប់រួចហើយ ផ្ញើសារ Join Room ទៅ Socket ភ្លាមៗ
    myId = myPeer.id;
    socket.emit('join-room', {
      roomId: currentRoomId,
      peerId: myId,
      username: myUsername
    });
  } else {
    // ប្រសិនបើមិនទាន់ភ្ជាប់ PeerJS ទេ ឱ្យវាតភ្ជាប់ឡើងវិញ
    initPeerJS();
  }

  showToast('🚪 បានចូលរួមបន្ទប់៖ ' + currentRoomId, 'success');
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
// AUTHENTICATION & LOGIN (FULL IMPLEMENTATION)
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

  var mainBody = document.getElementById('mainBody');
  if (mainBody) mainBody.style.justifyContent = 'flex-start';
  
  var authDiv = document.getElementById('auth');
  if (authDiv) authDiv.classList.add('hidden');

  if (currentUserRole === 'admin' || currentUserRole === 'supervisor') {
    socket.emit('register-admin');
    var adminDashboard = document.getElementById('admin-dashboard');
    if (adminDashboard) adminDashboard.classList.remove('hidden');
    var adminRoleDisplay = document.getElementById('adminRoleDisplay');
    if (adminRoleDisplay) adminRoleDisplay.textContent = currentUserRole.toUpperCase();
    switchAdminTab('rooms');
  } else {
    startMeeting();
  }
}

// ============================================================
// MEETING & WEBRTC (CROSS-NETWORK CONFIGURATION)
// ============================================================
function startMeeting() {
  var meetingContainer = document.getElementById('meeting-container');
  if (meetingContainer) meetingContainer.classList.remove('hidden');

  var displayRoomId = document.getElementById('displayRoomId');
  if (displayRoomId) displayRoomId.textContent = currentRoomId;

  initDummyStream();
  initPeerJS();
}

function initDummyStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(myUsername || 'User', canvas.width / 2, canvas.height / 2);
    dummyAnimFrame = requestAnimationFrame(draw);
  }
  draw();

  const canvasStream = canvas.captureStream(15);
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioContext.createOscillator();
  const dst = audioContext.createMediaStreamDestination();
  osc.connect(dst);
  osc.start();
  const audioTrack = dst.stream.getAudioTracks()[0];
  audioTrack.enabled = false;

  localStream = new MediaStream([canvasStream.getVideoTracks()[0], audioTrack]);
  if (localVideo) localVideo.srcObject = localStream;
}

function initPeerJS() {
  // Configured with Google Public STUN Servers for Cross-Network WebRTC connection
  myPeer = new Peer(undefined, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    }
  });

  myPeer.on('open', function(id) {
    myId = id;
    console.log('✅ PeerJS Connected with ID:', myId);
    socket.emit('join-room', {
      roomId: currentRoomId,
      peerId: myId,
      username: myUsername
    });
  });

  myPeer.on('call', function(call) {
    call.answer(localStream);
    
    call.on('stream', function(remoteStream) {
      const type = (call.metadata && call.metadata.type) || 'video';
      const callerUsername = (call.metadata && call.metadata.username) || 'User';
      
      if (type === 'screen') {
        addRemoteScreenVideo(call.peer, remoteStream, callerUsername);
      } else {
        attachRemoteStream(call.peer, remoteStream);
      }
    });

    peerCalls[call.peer] = call;
  });
}

function connectToUser(peerId) {
  if (!myPeer || peerCalls[peerId]) return;
  
  const call = myPeer.call(peerId, localStream, {
    metadata: { type: 'video', username: myUsername }
  });

  call.on('stream', function(remoteStream) {
    attachRemoteStream(peerId, remoteStream);
  });

  call.on('close', function() {
    removeRemoteVideo(peerId);
  });

  peerCalls[peerId] = call;
}

// ============================================================
// MEDIA & UI HANDLING
// ============================================================
function addRemoteVideo(peerId, username) {
  if (document.getElementById('video-' + peerId)) return;

  const card = document.createElement('div');
  card.className = 'video-card';
  card.id = 'video-' + peerId;

  card.innerHTML = `
    <video id="stream-${peerId}" autoplay playsinline></video>
    <div class="user-label">👤 ${username}</div>
  `;
  if (videoGrid) videoGrid.appendChild(card);
}

function attachRemoteStream(peerId, stream) {
  const videoElem = document.getElementById('stream-' + peerId);
  if (videoElem) {
    videoElem.srcObject = stream;
  }
}

function removeRemoteVideo(peerId) {
  const card = document.getElementById('video-' + peerId);
  if (card) card.remove();
}

function addRemoteScreenVideo(peerId, stream, username) {
  removeRemoteScreenVideo(peerId);

  const card = document.createElement('div');
  card.className = 'screen-card';
  card.id = 'screen-' + peerId;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  const label = document.createElement('div');
  label.className = 'user-label';
  label.textContent = '🖥️ Screen: ' + username;

  card.appendChild(video);
  card.appendChild(label);
  if (screenGrid) screenGrid.appendChild(card);
}

function removeRemoteScreenVideo(peerId) {
  const card = document.getElementById('screen-' + peerId);
  if (card) card.remove();
}

async function toggleCamera() {
  const btn = document.getElementById('btnCamera');
  if (!isCameraOn) {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const videoTrack = cameraStream.getVideoTracks()[0];
      const audioTrack = cameraStream.getAudioTracks()[0];

      if (localStream) {
        if (videoTrack) localStream.replaceTrack(localStream.getVideoTracks()[0], videoTrack);
        if (audioTrack) localStream.replaceTrack(localStream.getAudioTracks()[0], audioTrack);
      } else {
        localStream = cameraStream;
      }

      if (localVideo) localVideo.srcObject = localStream;
      
      // Update track for all connected peers
      for (let pId in peerCalls) {
        const sender = peerCalls[pId].peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender && videoTrack) sender.replaceTrack(videoTrack);
      }

      isCameraOn = true;
      if (btn) btn.classList.add('active');
      showToast('📷 កាមេរ៉ា និង មេក្រូ ត្រូវបានបើក', 'success');
    } catch (err) {
      showToast('❌ មិនអាចបើកកាមេរ៉ាបានទេ!', 'error');
    }
  } else {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    isCameraOn = false;
    if (btn) btn.classList.remove('active');
    initDummyStream();
    showToast('📷 កាមេរ៉ាត្រូវបានបិទ', 'info');
  }
}

async function toggleScreenShare() {
  const btn = document.getElementById('btnScreen');
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      isScreenSharing = true;
      if (btn) btn.classList.add('active');

      // Call all active users with the screen stream
      for (let pId in userNamesMap) {
        if (pId !== myId) {
          myPeer.call(pId, screenStream, { metadata: { type: 'screen', username: myUsername } });
        }
      }

      screenStream.getVideoTracks()[0].onended = function() {
        stopScreenSharing();
      };

      showToast('🖥️ បានចាប់ផ្ដើមចែករំលែក Screen', 'success');
    } catch (err) {
      console.error(err);
      showToast('❌ មិនអាចចែករំលែក Screen បានទេ!', 'error');
    }
  } else {
    stopScreenSharing();
  }
}

function stopScreenSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  isScreenSharing = false;
  const btn = document.getElementById('btnScreen');
  if (btn) btn.classList.remove('active');
  showToast('🖥️ បានបញ្ឈប់ការចែករំលែក Screen', 'info');
}

function toggleChat() {
  const chatPanel = document.getElementById('chat-panel');
  if (!chatPanel) return;
  isChatOpen = !isChatOpen;
  if (isChatOpen) {
    chatPanel.classList.remove('hidden');
  } else {
    chatPanel.classList.add('hidden');
  }
}

function sendPrivateMessage() {
  const recipientSelect = document.getElementById('chatRecipientSelect');
  const chatInput = document.getElementById('chatInput');
  if (!recipientSelect || !chatInput) return;

  const targetPeerId = recipientSelect.value;
  const message = chatInput.value.trim();

  if (!targetPeerId) {
    showToast('សូមជ្រើសរើសអ្នកទទួលសារ!', 'warning');
    return;
  }
  if (!message) return;

  socket.emit('send-private-message', {
    targetPeerId: targetPeerId,
    message: message,
    fromUsername: myUsername
  });

  const chatMsgs = document.getElementById('chat-messages');
  if (chatMsgs) {
    chatMsgs.innerHTML += '<div class="msg-item my-msg"><b>To 👤 ' + (userNamesMap[targetPeerId] || 'User') + ':</b><br>' + message + '</div>';
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  chatInput.value = '';
}

function updateUserCount() {
  const countElem = document.getElementById('userCount');
  if (countElem) {
    const totalUsers = Object.keys(userNamesMap).length + 1;
    countElem.textContent = totalUsers;
  }
}

function updateChatUserList() {
  const select = document.getElementById('chatRecipientSelect');
  if (!select) return;
  
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- ជ្រើសរើសអ្នកទទួលសារ --</option>';

  for (let pId in userNamesMap) {
    if (pId !== myId) {
      select.innerHTML += `<option value="${pId}">👤 ${userNamesMap[pId]}</option>`;
    }
  }
  select.value = currentVal;
}

function leaveMeeting() {
  if (confirm('តើអ្នកប្រាកដថាចង់ចាកចេញពីបន្ទប់ទេ?')) {
    location.reload();
  }
}

// ============================================================
// INITIALIZATION
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
  connectSocket();
  loadRooms();
});

// ============================================================
// ADMIN LOGOUT FUNCTION
// ============================================================
function logoutAdmin() {
  if (confirm('តើអ្នកប្រាកដថាចង់ចាកចេញពី Admin Dashboard ទេ?')) {
    if (socket && socketConnected) {
      socket.emit('logout');
    }
    
    showToast('👋 បានចាកចេញដោយជោគជ័យ!', 'info');

    // Reset Variables ទាំងអស់
    myUsername = '';
    currentUserRole = '';
    currentRoomId = '';
    pendingLoginData = null;

    // Reload Page ដើម្បីត្រឡប់ទៅកាន់ទំព័រ Login វិញ
    setTimeout(function() {
      window.location.reload();
    }, 500);
  }
}
