import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import Stripe from "stripe";

// 1. Configure Dotenv FIRST
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// 2. Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://loanlink-client.vercel.app", 
      "https://micro-loan.netlify.app" 
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// mongodb
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verify token middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

app.get("/", (req, res) => {
  res.send("LoanLink Server is Running");
});

async function run() {
  try {
    // Connect the client to the server
    // await client.connect();
    
    const db = client.db("loanLinkDB");
    const userCollection = db.collection("users");
    const loansCollection = db.collection("loans");
    const applicationCollection = db.collection("applications");

    // ================== AUTH RELATED APIs ==================

    // Create Token (Login)
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // Clear Token (Logout)
    app.post("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // ================== USER APIs ==================

    // Get All Users (Admin Manage Users)
    app.get("/users", verifyToken, async (req, res) => {
      try {
        const { search } = req.query;
        let query = {};
        if (search) {
          query = {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
            ],
          };
        }
        const result = await userCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Create User (Register)
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();
      const email = user.email;
      const userExits = await userCollection.findOne({ email });

      if (userExits) {
        return res.send({ message: "user exits" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // Get User Role by Email
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // Update User Role & Status (Admin Only)
    app.patch("/users/admin/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { role, status, suspensionReason } = req.body;
        const filter = { _id: new ObjectId(id) };

        let updateDoc = {
          $set: {},
        };

        if (role) updateDoc.$set.role = role;
        if (status) updateDoc.$set.status = status;

        if (status === "suspended" && suspensionReason) {
          updateDoc.$set.suspensionReason = suspensionReason;
        }

        if (status === "active") {
          updateDoc.$set.suspensionReason = null;
        }

        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Update User Profile by Email (For MyProfile Page)
    app.patch("/users/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const { name, photoURL } = req.body;

        const filter = { email: email };
        const updateDoc = {
          $set: {
            name: name,
            photoURL: photoURL,
          },
        };

        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // ================== LOAN APIs ==================

    // Get All Loans (Public/Private with Filter)
    app.get("/loans", async (req, res) => {
      try {
        const { search, category } = req.query;
        const filter = {};

        if (search) {
          filter.title = { $regex: search, $options: "i" };
        }

        if (category && category !== "all") {
          filter.category = category;
        }

        const data = await loansCollection.find(filter).toArray();
        res.send(data);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Create New Loan (Manager)
    app.post("/loans", verifyToken, async (req, res) => {
      try {
        const data = req.body;
        const newLoan = {
          ...data,
          showOnHome: data.showOnHome || false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await loansCollection.insertOne(newLoan);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Get Single Loan Details
    app.get("/loans/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const loan = await loansCollection.findOne({ _id: new ObjectId(id) });

        if (!loan) return res.status(404).send({ message: "Loan not found" });

        res.send(loan);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Update Loan Details
    app.put("/loans/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const update = req.body;

        const result = await loansCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              ...update,
              updatedAt: new Date(),
            },
          }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Delete Loan
    app.delete("/loans/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await loansCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Toggle Show on Home
    app.patch("/loans/toggle-home/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const loan = await loansCollection.findOne({ _id: new ObjectId(id) });
        if (!loan) return res.status(404).send({ message: "Loan not found" });

        const result = await loansCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { showOnHome: !loan.showOnHome } }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // ================== APPLICATION APIs ==================

    // Create Loan Application (User)
    app.post("/applications", verifyToken, async (req, res) => {
      try {
        const application = req.body;
        const newApplication = {
          ...application,
          status: "pending",
          feeStatus: "unpaid",
          createdAt: new Date(),
        };

        const result = await applicationCollection.insertOne(newApplication);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Get Applications (Admin/Manager with Filter)
    app.get("/applications", verifyToken, async (req, res) => {
      try {
        const { status } = req.query;
        let query = {};

        if (status) {
          query = { status: status };
        }

        const result = await applicationCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Get Applications by User Email (Borrower My Loans)
    app.get("/applications/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const result = await applicationCollection
          .find({ email: email })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Update Application Status (Approve/Reject)
    app.patch("/applications/status/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; 
        const filter = { _id: new ObjectId(id) };

        let updateDoc = {
          $set: { status: status },
        };

        if (status === "approved") {
          updateDoc.$set.approvedAt = new Date();
        }

        const result = await applicationCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Delete/Cancel Application (Only if pending)
    app.delete("/applications/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await applicationCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Update Fee Status (After Payment)
    app.patch("/applications/payment/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { transactionId, price, date } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            feeStatus: "paid",
            transactionId: transactionId,
            paidAmount: price,
            paidAt: date || new Date(),
          },
        };

        const result = await applicationCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // ================== STATS APIs ==================

    // Payment History API
    app.get("/payments/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email: email, feeStatus: "paid" };
        
        const result = await applicationCollection.find(query).sort({ paidAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Manager Stats API
    app.get("/manager/stats/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        const myLoans = await loansCollection
          .find({ managerEmail: email })
          .toArray();
        const myLoanIds = myLoans.map((loan) => loan._id.toString());

        const myApplications = await applicationCollection
          .find({ loanId: { $in: myLoanIds } })
          .toArray();

        const stats = {
          totalLoans: myLoans.length,
          totalApplications: myApplications.length,
          totalPending: myApplications.filter(
            (app) => app.status === "pending"
          ).length,
          totalApproved: myApplications.filter(
            (app) => app.status === "approved"
          ).length,
        };

        const recentApplications = myApplications
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5);

        res.send({ stats, recentApplications });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Admin Stats API
    app.get("/admin/stats", verifyToken, async (req, res) => {
      try {
        const totalUsers = await userCollection.estimatedDocumentCount();
        const totalLoans = await loansCollection.estimatedDocumentCount();
        const totalApplications =
          await applicationCollection.estimatedDocumentCount();

        const users = await userCollection.find().toArray();
        const borrowers = users.filter((u) => u.role === "borrower").length;
        const managers = users.filter((u) => u.role === "manager").length;
        const admins = users.filter((u) => u.role === "admin").length;

        res.send({
          totalUsers,
          totalLoans,
          totalApplications,
          roleStats: { borrowers, managers, admins },
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // User (Borrower) Stats API
    app.get("/user/stats/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        const myApplications = await applicationCollection
          .find({ email: email })
          .toArray();

        const stats = {
          totalApplied: myApplications.length,
          totalPending: myApplications.filter((app) => app.status === "pending")
            .length,
          totalApproved: myApplications.filter(
            (app) => app.status === "approved"
          ).length,
          totalRejected: myApplications.filter(
            (app) => app.status === "rejected"
          ).length,
        };

        const recentApplications = myApplications
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5);

        res.send({ stats, recentApplications });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // ================== PAYMENT API ==================
    
    // Create Payment Intent
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      try {
        const { price } = req.body;
        const amount = parseInt(price * 100); 

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card']
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Ping
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`LoanLink server is running on port ${port}`);
});


export default app;