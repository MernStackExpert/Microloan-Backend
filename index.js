import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MongoDB
const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: { version: ServerApiVersion.v1 },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("loanLinkDB");

    const users = db.collection("users");
    const loans = db.collection("loans");
    const applications = db.collection("applications");

    // -----------------------------
    //        USERS ROUTES
    // -----------------------------

    // Add / Update user from Firebase login
    app.put("/users", async (req, res) => {
      const { name, email, photoURL } = req.body;

      const userData = {
        name,
        email,
        photoURL,
        role: "borrower",
      };

      const result = await users.updateOne(
        { email },
        { $set: userData },
        { upsert: true }
      );

      res.send(result);
    });

    // Get all users
    app.get("/users", async (req, res) => {
      const result = await users.find().toArray();
      res.send(result);
    });

    // Update user role
    app.patch("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const role = req.body.role;

      const result = await users.updateOne({ email }, { $set: { role } });

      res.send(result);
    });


    // Root route
    app.get("/", (req, res) => {
      res.send("LoanLink API is running...");
    });
  } catch (e) {
    console.error(e);
  }
}

run().catch(console.dir);
// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
