const path = require('path');
const express = require('express');
const http = require('http');
const session = require('express-session');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Simple in-memory store for demo. For production, use a database or Redis.
const GROUP_IDS = ['group1', 'group2', 'group3', 'group4', 'group5'];
const groupIdToText = {
  group1: '',
  group2: '',
  group3: '',
  group4: '',
  group5: ''
};

// Combined board content
let combinedText = '';

function buildCombinedText() {
  return GROUP_IDS
    .map((gid) => groupIdToText[gid] || '')
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t) => t.length > 0)
    .join('\n\n');
}

const sessionMiddleware = session({
  secret: 'docsapp-secret',
  resave: false,
  saveUninitialized: true
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Group selection endpoint
app.post('/join', (req, res) => {
  const { groupId } = req.body;
  if (!GROUP_IDS.includes(groupId)) {
    return res.status(400).json({ ok: false, error: 'Invalid group' });
  }
  req.session.groupId = groupId;
  res.json({ ok: true });
});

// Expose current state
app.get('/state', (req, res) => {
  res.json({
    groupId: req.session.groupId || null,
    groupTexts: groupIdToText,
    combinedText
  });
});

// Share session with Socket.IO
io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

io.on('connection', (socket) => {
  const sessionData = socket.request.session || {};
  const groupId = sessionData.groupId || null;

  // Send initial state
  combinedText = buildCombinedText();
  socket.emit('init', {
    groupId,
    groupTexts: groupIdToText,
    combinedText
  });

  // Only allow edits from user's chosen group
  socket.on('group:update', ({ groupId: fromGroupId, text }) => {
    if (!sessionData.groupId || sessionData.groupId !== fromGroupId) {
      return; // ignore unauthorized edits
    }
    if (!GROUP_IDS.includes(fromGroupId) || typeof text !== 'string') {
      return;
    }
    groupIdToText[fromGroupId] = text;
    io.emit('group:updated', { groupId: fromGroupId, text });
    combinedText = buildCombinedText();
    io.emit('combined:updated', { text: combinedText });
  });

  // Center board is auto-generated; no direct edits needed
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


