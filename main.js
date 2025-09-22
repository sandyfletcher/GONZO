function getUsernameColor(str) { //  uses HSL to parse a colour from username string
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360; // get hue value 0 to 360
    return `hsl(${hue}, 80%, 55%)`; // fixed saturation/lightness for readability
}

const socket = io("https://fastchat-0opj.onrender.com/");

socket.on('connect', () => {
    console.log("Connected to server as", socket.id);
});

// PAGE SETUP

document.addEventListener('DOMContentLoaded', () => { 
    if (document.getElementById('start-room-btn')) { // route to correct setup function based on page content
        setupIndexPage();
    } else if (document.querySelector('.room-container')) {
        setupRoomPage();
    }
});
function setupIndexPage() {
    const startButton = document.getElementById('start-room-btn');
    startButton.addEventListener('click', (e) => {
        e.preventDefault();
        console.log("Requesting a new room from server...");
        socket.emit('create_room');
    });
}
function setupRoomPage() {
    const roomId = window.location.hash.substring(1);
    const ui = { // Cache relevant DOM elements into single object
        messagesContainer: document.querySelector('.messages'),
        messageForm: document.getElementById('message-form'),
        messageInput: document.getElementById('message-form').querySelector('input'),
        roomLinkElement: document.getElementById('room-link'),
        qrElement: document.querySelector('.qr-code'),
        memberList: document.querySelector('.member-list'),
        ownerName: document.querySelector('.owner-name')
    };
    if (!roomId) {
        ui.messagesContainer.innerHTML = '<p>ERROR: No room ID specified. Start a new room.</p>';
        ui.messageForm.style.display = 'none';
        return; // stop execution
    }
    initializeRoomUI(roomId, ui);
    setupMessageForm(roomId, ui);
    joinRoom(roomId);
}

// ROOM PAGE

function initializeRoomUI(roomId, ui) { // accepts ui object
    document.title = `FASTCHAT — room [${roomId.substring(0, 6)}]`;
    ui.roomLinkElement.textContent = window.location.href;
    ui.qrElement.innerHTML = ''; // clear placeholder
    const qr = qrcode(0, 'L');
    qr.addData(window.location.href);
    qr.make(); // createImgTag method returns an HTML string, fine for this library
    ui.qrElement.innerHTML = qr.createImgTag(4, 4); // (cellSize, margin)
}
function setupMessageForm(roomId, ui) {
    ui.messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = ui.messageInput.value.trim();
        if (message) {
            socket.emit('send_message', { roomId, message });
            ui.messageInput.value = '';
        }
    });
}
function joinRoom(roomId) {
    const oldSocketId = sessionStorage.getItem('previousSocketId');
    sessionStorage.removeItem('previousSocketId'); // clean up to only use once
    socket.emit('join_room', { roomId, oldSocketId });
}

// SOCKET EVENT LISTENERS

socket.on('room_created', (roomId) => {
    console.log(`Server created room. ID: ${roomId}`);
    sessionStorage.setItem('previousSocketId', socket.id); // store current socket ID before navigating away
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
        if (index === 0) { // first participant is owner (TODO: add changeable ownership)
            ownerName.textContent = `${p.username}`;
            displayName += ' (Owner)';
        }
        if (p.id === socket.id) { // add (You) tag for current client
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
    if (messagesContainer.querySelector('p')?.textContent === 'Connecting...') { // Clear "Connecting..." message on first real message
        messagesContainer.innerHTML = '';
    }
    // create message elements safely to prevent XSS
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
    // message part
    const messageText = document.createTextNode(` ${data.message}`);
    // combine and append
    messageElement.appendChild(usernameStrong);
    messageElement.appendChild(messageText);
    messagesContainer.appendChild(messageElement);
    // scroll to bottom
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