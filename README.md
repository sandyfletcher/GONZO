GONZO
------------------------
temporary chatrooms
------------------------
A minimalist, ephemeral, real-time chat application with a retro terminal aesthetic.
GONZO is a privacy-focused chat application that allows users to create temporary, anonymous chatrooms. There are no accounts, no long-term history, and rooms self-destruct when the host leaves. It's designed for quick, transient conversations.
[screenshot of the chat room interface]
------------------------
✨ Features
Anonymous & Ephemeral:
No user accounts, no sign-ups, no tracking. Chat data exists only in server memory and is wiped when a room is closed.

Self-Destructing Rooms:
 A chatroom and its entire history are permanently deleted from the server a few seconds after the original host disconnects.

Easy Sharing:
 Instantly share a room with others via a simple URL or a scannable QR code.

Responsive Retro UI:
 A clean, "hacker terminal" interface that works seamlessly on both desktop and mobile devices, including portrait and landscape modes.

Real-Time Communication:
 Built with WebSockets (Socket.IO) for instant message delivery.

Reconnect Grace Period:
 If a user disconnects temporarily (e.g., due to a network flicker), they have a 3-second window to rejoin without being marked as "left".

Limited Message History:
 New participants receive the last 10 messages/events upon joining, giving them context without storing extensive logs.

Deterministic User Avatars:
 Each user is assigned a unique color and emoji based on their temporary username, making conversations easy to follow.

Server-Side Rate Limiting:
 Prevents abuse by limiting the number of rooms that can be created from a single IP address within a one-minute window.
 
------------------------
🛠️ Tech Stack
Backend
Node.js: JavaScript runtime environment.
Express: Minimalist web framework for serving static files.
Socket.IO: Library for real-time, bidirectional event-based communication.
UUID: For generating unique room identifiers.
Frontend
HTML5 & CSS3: Structure and styling.
Modern CSS features like CSS Variables, Flexbox, and Media Queries are used for a fluid and themeable layout.
Vanilla JavaScript: All client-side logic is written without a framework.
Socket.IO Client: To connect to the backend WebSocket server.
qrcode-generator: For client-side generation of QR codes.
------------------------
🚀 Getting Started
To run this project locally, follow these steps:
Clone the repository:
code
Bash
git clone https://github.com/your-username/GONZO.git
cd GONZO
Install dependencies:
code
Bash
npm install
Start the server:
code
Bash
node server.js
Open the application:
Open your web browser and navigate to http://localhost:3000.
⚙️ How It Works
A user visits the home page (index.html) and clicks "START ROOM".
The client sends a create_room event to the server via Socket.IO.
The server generates a unique room ID (UUID), creates a new room object in server memory (stored in the rooms object), and makes the creator the "owner".
The server emits a room_created event back to the client with the new room ID.
The client's JavaScript redirects the user to room.html#<roomId>.
Upon loading room.html, the client script reads the room ID from the URL hash and sends a join_room event to the server.
Other users can join using the same URL. When they join, the server adds them to the list of participants for that room.
Messages sent by any client are broadcast to all other clients in the same room.
If the designated "owner" of the room disconnects, a 3-second timer starts. If they do not reconnect within this window, the server emits a room_closed event to all participants and deletes the room and its message history from memory.
------------------------
📁 Project Structure
code
Code
.
├── server.js           # The Node.js, Express, and Socket.IO backend logic
├── main.js             # Client-side JavaScript for handling UI and WebSocket events
├── index.html          # The main landing page
├── room.html           # The chat room page template
├── style.css           # All styles for the application, including the retro theme and responsive layouts
└── assets/
    └── favicon.ico     # Application favicon
------------------------
📜 License
This project is open-source. (You may want to add a LICENSE.md file, for example, with the MIT License).
------------------------
If you've made it this far, you're already in the repository.  Let's break it down:

[index.html]

The file starts with the head section that breaks down the imports: favicon + styling info from this codebase and the socket.io library.

The landing page info is then displayed, with a simple CSS animation to create the blinking cursor.

The button at the bottom emits the socket instructions to "create room".

[room.html]


