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
let encryptionKey = null; // Global variable to hold encryption key

socket.on('connect', () => {
    console.log("Connected to server with ID:", socket.id);
});

document.addEventListener('DOMContentLoaded', () => {
    // --- index.html ---
    const startButton = document.getElementById('start-room-btn');
    if (startButton) {
        startButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Requesting a new room from server...");
            socket.emit('create_room');
        });
    }
    // --- room.html ---
    const roomContainer = document.querySelector('.room-container');
    if (roomContainer) {
        // --- URL Parsing for Room ID and Encryption Key ---
        const hashParts = window.location.hash.substring(1).split('-');
        const roomId = hashParts[0];
        encryptionKey = hashParts[1]; // The key is the second part of the hash
        if (roomId && encryptionKey) {
            // Retrieve the old socket ID to prove we are the owner rejoining
            const oldSocketId = sessionStorage.getItem('previousSocketId');
            sessionStorage.removeItem('previousSocketId'); // clean up so it's only used once
            socket.emit('join_room', { roomId, oldSocketId });
            // Update UI
            document.title = `FASTCHAT — room [${roomId.substring(0, 6)}]`;
            const roomLinkElement = document.getElementById('room-link');
            roomLinkElement.textContent = window.location.href; // The full URL contains the key for sharing
            const qrElement = document.querySelector('.qr-code');
            qrElement.innerHTML = ''; // Clear placeholder text
            const qr = qrcode(0, 'L'); // type 0, error correction 'L'
            qr.addData(window.location.href);
            qr.make();
            qrElement.innerHTML = qr.createImgTag(4, 4); // (cellSize, margin)
            // --- Message form logic to ENCRYPT messages ---
            const messageForm = document.getElementById('message-form');
            const messageInput = messageForm.querySelector('input');
            messageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const message = messageInput.value.trim();
                if (message) {
                    // Encrypt message before sending
                    const ciphertext = CryptoJS.AES.encrypt(message, encryptionKey).toString();
                    socket.emit('send_message', { roomId, message: ciphertext }); // Send encrypted text
                    messageInput.value = '';
                }
            });
        } else {
            // Handle case where room.html is loaded without a room ID or key
            const messages = document.querySelector('.messages');
            messages.innerHTML = '<p>ERROR: Invalid room link. Please go back and start a new room.</p>';
            document.getElementById('message-form').style.display = 'none';
        }
    }
});

// --- Socket Event Listeners ---
socket.on('room_created', (roomId) => {
    console.log(`Server created room. ID: ${roomId}`);
    // Store our current socket ID before we navigate away
    sessionStorage.setItem('previousSocketId', socket.id);
    // Generate a secret key for encryption
    const key = CryptoJS.lib.WordArray.random(128 / 8).toString(CryptoJS.enc.Hex);
    // Navigate to the new room, including the key in the hash
    window.location.href = `room.html#${roomId}-${key}`;
});

socket.on('update_participants', (participants) => {
    console.log('Updating participants:', participants);
    const memberList = document.querySelector('.member-list');
    const ownerName = document.querySelector('.owner-name');
    if (!memberList || !ownerName) return;
    memberList.innerHTML = '';
    participants.forEach((p, index) => {
        const li = document.createElement('li');
        let displayName = p.username;
        // first participant in the list is always the owner
        if (index === 0) { 
            ownerName.textContent = `${p.username}`;
            displayName += ' (Owner)';
        }
        // Add (You) tag for current client
        if (p.id === socket.id) {
            displayName += ' (You)';
            // If owner, also add "(You)" to owner display
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
    if (messagesContainer) {
        // Clear the "Connecting..." message on first message
        if (messagesContainer.querySelector('p')?.textContent === 'Connecting...') {
            messagesContainer.innerHTML = '';
        }
        // DECRYPT the incoming message
        let decryptedMessage = '';
        try {
            const bytes = CryptoJS.AES.decrypt(data.message, encryptionKey);
            decryptedMessage = bytes.toString(CryptoJS.enc.Utf8);
            if (!decryptedMessage) { // Handle cases where decryption results in an empty string
                throw new Error("Decryption failed.");
            }
        } catch (e) {
            console.error("Could not decrypt message:", e);
            decryptedMessage = "[Could not decrypt message - key mismatch?]";
        }
        const messageElement = document.createElement('p');
        const sender = data.sender;
        // Generate the color from the username
        const userColor = getUsernameColor(sender.username);
        // Sanitize the DECRYPTED message
        const sanitizedMessage = decryptedMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        messageElement.innerHTML = `<strong>&lt;<span style="color: ${userColor};">${sender.username}</span>&gt;</strong> ${sanitizedMessage}`;
        messagesContainer.appendChild(messageElement);
        // Scroll to the bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});

socket.on('room_closed', (message) => {
    alert(message);
    window.location.href = 'index.html';
});

socket.on('join_error', (message) => {
    alert(message);
    window.location.href = 'index.html';
});