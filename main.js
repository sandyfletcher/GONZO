/**
 * Generates a consistent, readable color from a string (like a username).
 * Uses HSL color model to ensure good saturation and lightness.
 * @param {string} str The input string.
 * @returns {string} An HSL color string (e.g., "hsl(120, 80%, 55%)").
 */
function getUsernameColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360; // Get hue value between 0 and 360
    return `hsl(${hue}, 80%, 55%)`; // Fixed saturation and lightness for readability
}

const socket = io("https://fastchat-0opj.onrender.com/");

socket.on('connect', () => {
    console.log("Connected to server with ID:", socket.id);
});

// --- Page Setup ---

document.addEventListener('DOMContentLoaded', () => {
    // Route to the correct setup function based on the page's content
    if (document.getElementById('start-room-btn')) {
        setupIndexPage();
    } else if (document.querySelector('.room-container')) {
        setupRoomPage();
    }
});

function setupIndexPage() {
    const startButton = document.getElementById('start-room-btn');
    const usernameInput = document.getElementById('username-input');

    startButton.addEventListener('click', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim() || 'anon';
        sessionStorage.setItem('username', username);
        console.log("Requesting a new room from server...");
        socket.emit('create_room', { username });
    });
}

function setupRoomPage() {
    const roomId = window.location.hash.substring(1);
    const messagesContainer = document.querySelector('.messages');
    const messageForm = document.getElementById('message-form');

    if (!roomId) {
        messagesContainer.innerHTML = '<p>ERROR: No room ID specified. Please go back and start a new room.</p>';
        messageForm.style.display = 'none';
        return; // Stop execution
    }

    initializeRoomUI(roomId);
    setupMessageForm(roomId);
    joinRoom(roomId);
}

// --- Helper Functions for Room Page ---

/** Gets username from sessionStorage or prompts user if it's missing. */
function getUsername() {
    let username = sessionStorage.getItem('username');
    if (!username) {
        username = prompt("Please enter your name:", "anon") || "anon";
        sessionStorage.setItem('username', username);
    }
    return username;
}

function initializeRoomUI(roomId) {
    document.title = `FASTCHAT — room [${roomId.substring(0, 6)}]`;

    const roomLinkElement = document.getElementById('room-link');
    roomLinkElement.textContent = window.location.href;

    const qrElement = document.querySelector('.qr-code');
    qrElement.innerHTML = ''; // Clear placeholder
    const qr = qrcode(0, 'L');
    qr.addData(window.location.href);
    qr.make();
    qrElement.innerHTML = qr.createImgTag(4, 4); // (cellSize, margin)
}

function setupMessageForm(roomId) {
    const messageForm = document.getElementById('message-form');
    const messageInput = messageForm.querySelector('input');

    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (message) {
            socket.emit('send_message', { roomId, message });
            messageInput.value = '';
        }
    });
}

function joinRoom(roomId) {
    const oldSocketId = sessionStorage.getItem('previousSocketId');
    sessionStorage.removeItem('previousSocketId'); // Clean up so it's only used once
    
    const username = getUsername();

    socket.emit('join_room', { roomId, oldSocketId, username });
}

// --- Socket Event Listeners ---

socket.on('room_created', (roomId) => {
    console.log(`Server created room. ID: ${roomId}`);
    // Store our current socket ID before navigating away
    sessionStorage.setItem('previousSocketId', socket.id);
    window.location.href = `room.html#${roomId}`;
});

socket.on('update_participants', (participants) => {
    console.log('Updating participants:', participants);
    const memberList = document.querySelector('.member-list');
    const ownerName = document.querySelector('.owner-name');
    if (!memberList || !ownerName) return;

    memberList.innerHTML = ''; // Clear old list
    participants.forEach((p, index) => {
        const li = document.createElement('li');
        let displayName = p.username;

        // The first participant is always the owner
        if (index === 0) {
            ownerName.textContent = `${p.username}`;
            displayName += ' (Owner)';
        }

        // Add a "(You)" tag for the current client
        if (p.id === socket.id) {
            displayName += ' (You)';
            if (index === 0) {
                ownerName.textContent += ' (You)';
            }
        }
        li.textContent = displayName;
        memberList.appendChild(li);
    });
});

socket.on('receive_message', (data) => {
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;

    // Clear "Connecting..." message on first real message
    if (messagesContainer.querySelector('p')?.textContent === 'Connecting...') {
        messagesContainer.innerHTML = '';
    }

    // Create message elements safely to prevent XSS
    const messageElement = document.createElement('p');
    const sender = data.sender;
    const userColor = getUsernameColor(sender.username);

    // <username> part
    const usernameStrong = document.createElement('strong');
    const usernameSpan = document.createElement('span');
    usernameSpan.style.color = userColor;
    usernameSpan.textContent = sender.username;

    usernameStrong.append('<');
    usernameStrong.appendChild(usernameSpan);
    usernameStrong.append('>');

    // Message part
    const messageText = document.createTextNode(` ${data.message}`);

    // Combine and append
    messageElement.appendChild(usernameStrong);
    messageElement.appendChild(messageText);
    messagesContainer.appendChild(messageElement);

    // Scroll to the bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on('room_closed', (message) => {
    alert(message);
    window.location.href = 'index.html';
});

socket.on('join_error', (message) => {
    alert(message);
    window.location.href = 'index.html';
});