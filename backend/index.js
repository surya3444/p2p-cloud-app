// server/auth_server.js
require('dotenv').config();
const express = require('express');
const { ExpressPeerServer } = require('peer');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const { Server } = require('socket.io');

// --- APP & SERVER SETUP ---
const app = express();
const whitelist = ['http://localhost:5173', 'http://localhost:4173', 'https://your-project-name.vercel.app'];
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
const server = http.createServer(app);
const PORT = process.env.PORT || 8000;

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB connected successfully.'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- USER SCHEMA ---
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    googleId: { type: String },
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpiry: { type: Date },
});
const User = mongoose.model('User', UserSchema);

// --- EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// --- GOOGLE OAUTH CLIENT ---
const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage',
);

// --- API ENDPOINTS FOR AUTHENTICATION ---

// REGISTRATION
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Please provide all fields.' });
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) return res.status(400).json({ message: 'Password is not strong enough.' });
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'User with this email already exists.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = Date.now() + 10 * 60 * 1000;
        const newUser = new User({ name, email, password: hashedPassword, otp, otpExpiry });
        await newUser.save();
        await transporter.sendMail({ from: process.env.EMAIL_USER, to: email, subject: 'Your Verification Code', text: `Your code is: ${otp}` });
        res.status(201).json({ message: 'Registration successful. Please check your email for the OTP.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error during registration.', error: err.message });
    }
});

// OTP VERIFICATION
app.post('/api/verify', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || user.otp !== otp || user.otpExpiry < Date.now()) return res.status(400).json({ message: 'Invalid or expired OTP.' });
        user.isVerified = true; user.otp = undefined; user.otpExpiry = undefined;
        await user.save();
        const token = jwt.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({ message: 'Email verified successfully.', token });
    } catch (err) {
        res.status(500).json({ message: 'Server error during verification.', error: err.message });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !user.password) return res.status(404).json({ message: 'User not found or registered with Google.' });
        if (!user.isVerified) return res.status(401).json({ message: 'Please verify your email first.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials.' });
        const token = jwt.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({ message: 'Login successful.', token });
    } catch (err) {
        res.status(500).json({ message: 'Server error during login.', error: err.message });
    }
});

// GOOGLE OAUTH
app.post('/api/auth/google', async (req, res) => {
    console.log("Received a request at /api/auth/google.");
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ message: 'No authorization code provided.' });
        const { tokens } = await oAuth2Client.getToken(code);
        const ticket = await oAuth2Client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name } = payload;
        let user = await User.findOne({ googleId });
        if (!user) {
            user = new User({ googleId, email, name, isVerified: true });
            await user.save();
        }
        const token = jwt.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({ message: 'Google sign-in successful.', token });
    } catch (err) {
        console.error("Google auth error:", err);
        res.status(500).json({ message: 'Google authentication failed.' });
    }
});

// --- PEERJS SERVER SETUP ---
const peerServer = ExpressPeerServer(server, {
    allow_discovery: true,
});
app.use('/myapp', peerServer);

// --- SECURE MATCHMAKING LOGIC WITH SOCKET.IO ---
const io = new Server(server, { cors: corsOptions });

const hostRegistry = {}; // For private user connections
const webPreviewRegistry = {}; // ✨ NEW: For public website previews

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // --- Private Connection Logic (Unchanged) ---
    socket.on('register-host', ({ token, peerId }) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.id;
            hostRegistry[userId] = peerId;
            console.log(`Host registered for private access: User ${userId} -> Peer ${peerId}`);
        } catch (err) {
            console.error("Invalid token during host registration.");
        }
    });

    socket.on('find-my-host', ({ token }, callback) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.id;
            const hostPeerId = hostRegistry[userId];
            if (hostPeerId) {
                callback({ hostPeerId });
            } else {
                callback({ error: 'Your host is not online for private access.' });
            }
        } catch (err) {
            callback({ error: 'Invalid authentication token.' });
        }
    });

    // --- Public Website Preview Logic ---
    socket.on('register-webreview', ({ projectId, peerId }) => {
        // Here, you could add checks to see if projectId is already taken
        webPreviewRegistry[projectId] = peerId;
        console.log(`Web Preview registered: Project '${projectId}' -> Peer ${peerId}`);
    });

    socket.on('find-webreview-host', ({ projectId }, callback) => {
        const hostPeerId = webPreviewRegistry[projectId];
        if (hostPeerId) {
            console.log(`Web Preview client found Host for '${projectId}' at Peer ${hostPeerId}`);
            callback({ hostPeerId });
        } else {
            callback({ error: 'The requested project preview is not online.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        // Future enhancement: Clean up registries if a host disconnects.
    });
});

// --- START THE SERVER ---
server.listen(PORT, () => {
    console.log(`🚀 Server is live on port ${PORT}`);
    console.log('PeerJS server is running at /myapp');
});