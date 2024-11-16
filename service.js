const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

class MongoDBService {
  constructor(uri) {
    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
  }

  async connect() {
    try {
      await this.client.connect();
      await this.client.db("temanternak").command({ ping: 1 });
      console.log(
        "Pinged your deployment. You successfully connected to MongoDB!"
      );
    } catch (error) {
      console.error("Failed to connect to MongoDB", error);
    }
  }

  async close() {
    try {
      await this.client.close();
    } catch (error) {
      console.error("Failed to close MongoDB connection", error);
    }
  }

  async updateCallLogs(consultationId, userId, state, time) {
    try {
      const result = await this.client
        .db("temanternak")
        .collection("consultations")
        .updateOne(
          { _id: ObjectId.createFromHexString(consultationId) },
          {
            $push: {
              call_logs: { userId, state, time },
            },
          }
        );
      return result;
    } catch (error) {
      console.error("Failed to update consultation", error);
    }
  }
  async updateChatLogs(consultationId, message) {
    try {
      const result = await this.client
        .db("temanternak")
        .collection("consultations")
        .updateOne(
          { _id: ObjectId.createFromHexString(consultationId) },
          {
            $push: {
              chat_logs: message,
            },
          }
        );
      return result;
    } catch (error) {
      console.error("Failed to update consultation", error);
    }
  }

  async getChatLogs(consultationId) {
    try {
      const consultation = await this.client
        .db("temanternak")
        .collection("consultations")
        .findOne(
          { _id: ObjectId.createFromHexString(consultationId) },
          { projection: { chat_logs: 1 } }
        );
      return consultation?.chat_logs || [];
    } catch (error) {
      console.error("Failed to get chat logs", error);
      return [];
    }
  }
}

module.exports = MongoDBService;
