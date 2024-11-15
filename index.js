const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http,{
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    }
});
const { configDotenv } = require('dotenv');
configDotenv();
const path = require('path');
const jwt = require('jsonwebtoken');
const MongoDBService = require('./service');

app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms and their participants
const rooms = new Map();
const mongoDBService = new MongoDBService(process.env.MONGODB_URI);
mongoDBService.connect();
io.on('connection', (socket) => {
    // console.log('A user connected');
    mongoDBService.updateConsultation(socket.request.roomInfo.roomId, socket.request.roomInfo.userId, 'connected', new Date());

    socket.on('join-room', async () => {
        console.log('User joined room');
        console.log(socket.request.roomInfo);
        const { roomId,  userId } = socket.request.roomInfo;
        socket.join(roomId);
    
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        // Notify others in the room
        socket.to(roomId).emit('user-connected', socket.id, userId);
        
        // Send list of existing participants to the new user
        const participants = Array.from(rooms.get(roomId)).filter(id => id !== socket.id);
        socket.emit('existing-participants', participants);
    });

    socket.on('offer', (offer, roomId, targetId, isMuted, isVideoOn) => {
        console.log(socket.request.user);
        console.log('Offer received');
        socket.to(targetId).emit('offer', offer, socket.id, socket.request.roomInfo.userId, isMuted, isVideoOn);
    });

    socket.on('answer', (answer, roomId, targetId, isMuted, isVideoOn) => {
        console.log('Answer received');
        socket.to(targetId).emit('answer', answer, socket.id, isMuted, isVideoOn);
    });

    socket.on('ice-candidate', (candidate, roomId, targetId) => {
        console.log('Ice candidate');
        socket.to(targetId).emit('ice-candidate', candidate, socket.id);
    });

    socket.on('user-muted',(targetId, isMuted) => {
        console.log(socket.id, 'User mic toggled');
        socket.to(targetId).emit('user-muted', socket.id, isMuted);
    })
    socket.on('user-video-toggled',(targetId, isVideoOn) => {
        console.log(socket.id, 'User video toggled');
        socket.to(targetId).emit('user-video-toggled', socket.id, isVideoOn);
    })

    socket.on('disconnect', () => {
        // console.log('User disconnected : ', socket.request.user.name);
        mongoDBService.updateConsultation(socket.request.roomInfo.roomId, socket.request.roomInfo.userId, 'disconnected', new Date());
        
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

const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']
    if(token){

        jwt.verify(token.substring(7), 'your_secret', async (err, decoded) => {
            if(err){
                console.log("err", err);
            }else{
                req.roomInfo = decoded;
                next();
            }
        });

    }
    
};

io.engine.use(authenticateToken);