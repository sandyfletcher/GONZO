const socket = io("http://localhost:3000");
socket.on('connect', () => {
    console.log("Connected to server with ID:", socket.id);
});
document.addEventListener('DOMContentLoaded', () => {
    // --- For index.html ---
    const startButton = document.getElementById('start-room-btn');
    if (startButton) {
        startButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Requesting a new room from server...");
            socket.emit('create_room'); 
        });
    }
    // --- For room.html ---
    const roomContainer = document.querySelector('.room-container');
    if (roomContainer) {
        const roomId = window.location.hash.substring(1);
        if (roomId) {
            // Retrieve the old socket ID to prove we are the owner rejoining
            const oldSocketId = sessionStorage.getItem('previousSocketId');
            sessionStorage.removeItem('previousSocketId'); // clean up so it's only used once
            // Join the room, sending the old ID for verification if it exists
            socket.emit('join_room', { roomId, oldSocketId });
            // Update UI
            document.title = `FASTCHAT — room [${roomId.substring(0, 6)}]`;
            const roomLinkElement = document.getElementById('room-link');
            roomLinkElement.textContent = window.location.href; // Use the full URL for easy sharing
            const qrElement = document.querySelector('.qr-code');
            qrElement.textContent = `QR for ${roomId}`; // Placeholder
            // Message form logic
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
        } else {
            // Handle case where room.html is loaded without a room ID
            const messages = document.querySelector('.messages');
            messages.innerHTML = '<p>ERROR: No room ID specified. Please go back and start a new room.</p>';
            document.getElementById('message-form').style.display = 'none';
        }
    }
});
// --- Socket Event Listeners ---
socket.on('room_created', (roomId) => {
    console.log(`Server created room. ID: ${roomId}`);
    // **KEY CHANGE 1**: Store our current socket ID before we navigate away
    sessionStorage.setItem('previousSocketId', socket.id);
    // Navigate to the new room
    window.location.href = `room.html#${roomId}`;
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
        // The first participant in the list is always the owner
        if (index === 0) { 
            ownerName.textContent = `${p.username}`;
            displayName += ' (Owner)';
        }
        // Add a "(You)" tag for the current client
        if (p.id === socket.id) {
            displayName += ' (You)';
            // If I am the owner, also add "(You)" to the owner display
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
        const messageElement = document.createElement('p');
        // Simple XSS prevention by replacing < and >
        const sanitizedMessage = data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        messageElement.innerHTML = `<strong>&lt;${data.username}&gt;</strong> ${sanitizedMessage}`;
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