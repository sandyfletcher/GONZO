const socket = io("http://localhost:3000");
socket.on('connect', () => {
    console.log("Connected to server with ID:", socket.id);
});
document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-room-btn');
    if (startButton) {
        startButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Requesting a new room from server...");
            socket.emit('create_room'); 
        });
    }
    const roomContainer = document.querySelector('.room-container');
    if (roomContainer) {
        const roomId = window.location.hash.substring(1);
        if (roomId) {
            const oldSocketId = sessionStorage.getItem('previousSocketId');
            sessionStorage.removeItem('previousSocketId'); // clean up so it's only used once
            socket.emit('join_room', { roomId, oldSocketId });
            document.title = `FASTCHAT — room [${roomId.substring(0, 6)}]`;
            const roomLinkElement = document.getElementById('room-link');
            roomLinkElement.textContent = `fastchat.url/link/${roomId}`;
            const qrElement = document.querySelector('.qr-code');
            qrElement.textContent = `QR for ${roomId}`;
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
            const messages = document.querySelector('.messages');
            messages.innerHTML = '<p>ERROR: No room ID specified...</p>';
            document.getElementById('message-form').style.display = 'none';
        }
    }
});
socket.on('room_created', (roomId) => {
    console.log(`Server created room. ID: ${roomId}`);
    sessionStorage.setItem('previousSocketId', socket.id);
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
        if (index === 0) { // first participant is always considered the owner in this list
            ownerName.textContent = `${p.username}`;
            displayName += ' (Owner)';
        }
        if (p.id === socket.id) {
            displayName += ' (You)'; // Ensure owner display also gets the "(You)" tag if applicable
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
        const messageElement = document.createElement('p');
        const sanitizedMessage = data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // simple XSS prevention by replacing < and >
        messageElement.innerHTML = `<strong>&lt;${data.username}&gt;</strong> ${sanitizedMessage}`;
        messagesContainer.appendChild(messageElement);
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