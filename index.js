const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http,{
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms and their participants
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        // Notify others in the room
        socket.to(roomId).emit('user-connected', socket.id);
        
        // Send list of existing participants to the new user
        const participants = Array.from(rooms.get(roomId)).filter(id => id !== socket.id);
        socket.emit('existing-participants', participants);
    });

    socket.on('offer', (offer, roomId, targetId) => {
        socket.to(targetId).emit('offer', offer, socket.id);
    });

    socket.on('answer', (answer, roomId, targetId) => {
        socket.to(targetId).emit('answer', answer, socket.id);
    });

    socket.on('ice-candidate', (candidate, roomId, targetId) => {
        socket.to(targetId).emit('ice-candidate', candidate, socket.id);
    });

    socket.on('disconnect', () => {
        // Remove user from all rooms they were in
        rooms.forEach((participants, roomId) => {
            if (participants.has(socket.id)) {
                participants.delete(socket.id);
                if (participants.size === 0) {
                    rooms.delete(roomId);
                }
                io.to(roomId).emit('user-disconnected', socket.id);
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});