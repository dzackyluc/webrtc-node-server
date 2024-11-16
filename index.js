const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
const { configDotenv } = require("dotenv");
configDotenv();
const path = require("path");
const jwt = require("jsonwebtoken");
const MongoDBService = require("./service");
const { ObjectId } = require("mongodb");

app.use(express.static(path.join(__dirname, "public")));

// Store active rooms and their participants
const rooms = new Map();
const messageStore = {};
const mongoDBService = new MongoDBService(process.env.MONGODB_URI);
mongoDBService.connect();

io.on("connection", (socket) => {
  mongoDBService.updateCallLogs(
    socket.request.roomInfo.roomId,
    socket.request.roomInfo.userId,
    "connected",
    new Date()
  );

  socket.on("join-room", async (sanctumToken, bookingId) => {
    console.log("User joined room");

    const { roomId, userId } = socket.request.roomInfo;
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    rooms.get(roomId).add(socket.id);

    messageStore[roomId] = await mongoDBService.getChatLogs(roomId);

    if (messageStore[roomId]) {
      socket.emit("previousMessages", messageStore[roomId]);
    }
    // Notify others in the room
    socket.to(roomId).emit("user-connected", socket.id, userId);

    fetch(
      `https://api.temanternak.h14.my.id/bookings/${bookingId}/consultation/attendee`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + sanctumToken,
        },
      }
    )
      .then((res) => {
        res.json().then((data) => {
          console.log(data);
        });
      })
      .catch((err) => {
        console.log(err);
      });
    // Send list of existing participants to the new user
    const participants = Array.from(rooms.get(roomId)).filter(
      (id) => id !== socket.id
    );
    socket.emit("existing-participants", participants);
  });

  socket.on("offer", (offer, roomId, targetId, isMuted, isVideoOn) => {
    if (
      socket.request.roomInfo?.actualStartTime &&
      new Date(socket.request.roomInfo?.actualStartTime) > new Date()
    ) {
      console.log("Offer received");
      socket
        .to(targetId)
        .emit(
          "offer",
          offer,
          socket.id,
          socket.request.roomInfo.userId,
          isMuted,
          isVideoOn
        );
    }
  });

  socket.on("answer", (answer, roomId, targetId, isMuted, isVideoOn) => {
    console.log("Answer received");
    if (
      socket.request.roomInfo?.actualStartTime &&
      new Date(socket.request.roomInfo?.actualStartTime) > new Date()
    ) {
      socket.to(targetId).emit("answer", answer, socket.id, isMuted, isVideoOn);
    }
  });

  socket.on("ice-candidate", (candidate, roomId, targetId) => {
    console.log("Ice candidate");
    socket.to(targetId).emit("ice-candidate", candidate, socket.id);
  });

  socket.on("user-muted", (targetId, isMuted) => {
    socket.to(targetId).emit("user-muted", socket.id, isMuted);
  });
  socket.on("user-video-toggled", (targetId, isVideoOn) => {
    socket.to(targetId).emit("user-video-toggled", socket.id, isVideoOn);
  });

  socket.on("sendMessage", (message) => {
    console.log("Message received", message);
    const { roomId, userId } = socket.request.roomInfo;
    const chatMessage = {
      id: ObjectId.createFromTime(new Date().getTime()), // ID unik untuk setiap pesan
      roomId,
      userId,
      ...message,
      timestamp: new Date(),
    };

    mongoDBService.updateChatLogs(roomId, chatMessage);
    // Simpan pesan ke dalam penyimpanan sementara
    if (!messageStore[roomId]) {
      messageStore[roomId] = [];
    }
    messageStore[roomId].push(chatMessage);

    // Broadcast pesan ke semua user di room
    io.to(roomId).emit("receiveMessage", chatMessage);
  });

  // Menerima permintaan untuk mendapatkan pesan yang belum diterima
  socket.on("getNewMessages", (lastReceivedId) => {
    const newMessages = messageStore[socket.request.roomInfo.roomId]?.filter(
      (msg) => msg.id > lastReceivedId
    );
    socket.emit("receiveNewMessages", newMessages ?? []);
  });

  socket.on("disconnect", () => {
    mongoDBService.updateCallLogs(
      socket.request.roomInfo.roomId,
      socket.request.roomInfo.userId,
      "disconnected",
      new Date()
    );

    // Remove user from all rooms they were in
    rooms.forEach((participants, roomId) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          rooms.delete(roomId);
        }
        io.to(roomId).emit("user-disconnected", socket.id);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (token) {
    jwt.verify(
      token.substring(7),
      process.env.JWT_SECRET,
      async (err, decoded) => {
        if (err) {
          console.log("err", err);
        } else {
          req.roomInfo = decoded;
          next();
        }
      }
    );
  }
};

io.engine.use(authenticateToken);
