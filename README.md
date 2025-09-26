GONZO — temporary chatrooms
------------------------

GONZO is a real-time chat application that allows users to create temporary, anonymous chatrooms.

[screenshot of the chat room interface]

FEATURES
------------------------
✨  ANONYMOUS: No accounts or identifying info — users are assigned a randomized username, which is used to generate a unique colour to make conversations easier to follow

✨  EPHEMERAL: The chatroom and its entire history are completely purged from the server 3 seconds after the host disconnects (the grace period is for users with inconsistent  internet connections)

✨  SHAREABLE: Room codes are unique enough to be impossible to guess, but can be easily accessed with the clickable URL or QR codes

TECH STACK
------------------------
🛠️  HTML5 & CSS3: structure and styling

🛠️  JAVASCRIPT: client-side logic

🛠️  SOCKET.IO: library for bidirectional communication

🛠️  QRCODE-GENERATOR: library that's appropriately named

🛠️  UUID: library for unique room identifiers

🛠️  NODE.JS: runtime environment

🛠️  EXPRESS: web framework for serving static files

CODEBASE
------------------------
📁
├── index.html          # landing page
├── room.html           # chat room page template
├── style.css           # retro terminal styling and responsive layout parameters
├── server.js           # node.js, express, and socket.io backend logic
├── main.js             # client-side javascript for handling ui and websocket events
└── assets/
    └── favicon.ico     # site favicon

MECHANICAL FLOW
------------------------

⚙️  User arrives at the site and is immediately assigned a randomized visitor ID 

⚙️  Clicking the "> START ROOM" button sends a create_room event to the server via Socket.IO

⚙️  The server generates a unique room ID, creates an associated room object, and emits a room_created event back to the client

⚙️  The browser learning the room ID triggers JavaScript that redirects the user to the unique URL, then sends a join_room event back to the server

⚙️  The server recognizes the oldSocketId and re-associates the user, updating their ID with a new one, then broadcasting the updated participant list to the room

⚙️  Usernames are quite long (e.g.: HsJ78HmzhwS-iuJLAAKj), so they're truncated and assigned a colour identifier to make it easy to differentiate users from one another

⚙️  The room functions by storing the last 10 messages in memory and culling anything additional every minute

⚙️  When a user sends a message, the server broadcasts that message to all other clients in the same room and adds it to the message history

⚙️  Clickable share buttons offer text- and image-based ways to share the room with others

⚙️  When others join, the server repeats the process of assigning pseudonymous identifiers, broadcasts their arrival to the chatroom, and provides them the stored conversation context

⚙️  If the room's owner disconnects, the server allows a grace period of 3 seconds to reconnect for users with poor internet connections

⚙️  If the owner of the room disconnects, a grace period of 3 seconds to reconnect

 is triggered allows them to reconnect, a 3-second timer starts. If they do not reconnect within this window (by reloading the page, which triggers the join_room flow), the server emits a room_closed event to all participants and deletes the room and its message history from memory.

GETTING STARTED
------------------------
Just use the [site](https://gonzo.sandyfletcher.ca/)!

Before you go saying it has problems connecting, wait another minute or two.

I'm using the free tier from Render to host the server and it'll power off if no one's used it in a while.

Should work perfectly once it's had that first coffee!

📜 License
------------------------

This project is open-source, but I might add a LICENSE.md file with the MIT License