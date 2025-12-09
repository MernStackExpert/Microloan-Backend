import express from "express";
const app = express();
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
const port = process.env.PORT || 3000;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// middleware
app.use(cors());
app.use(express.json());
dotenv.config();
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'https://your-live-site.com' 
  ],
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser()); 

const verifyFBToken = (req, res, next) => {
  console.log("headers in the middleware ", req.headers.authorization);
  next();
};

// mongodb
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};


app.get("/", (req, res) => {
  res.send("Hello World!");
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("loanLinkDB");
    const userCollection = db.collection("users");
    const loansCollection = db.collection("loans");
    const applicationCollection = db.collection("applications");


    /////////////// JWT //////////////////////////////

    // 1. Create Token (Login)
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });

      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // 2. Clear Token (Logout)
    app.post('/logout', async (req, res) => {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });



    ///////////////////Users///////////////////////////
    app.get("/users", async (req, res) => {
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

    // 1. Get User Role by Email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // Update User Role & Status (Admin Only)
    app.patch("/users/admin/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role, status, suspensionReason } = req.body;
        const filter = { _id: new ObjectId(id) };

        let updateDoc = {
          $set: {},
        };

        if (role) updateDoc.$set.role = role;
        if (status) updateDoc.$set.status = status;

        // If suspending, save the reason
        if (status === "suspended" && suspensionReason) {
          updateDoc.$set.suspensionReason = suspensionReason;
        }

        // If reactivating, clear the reason
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
    app.patch("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { name, photoURL } = req.body;
        
        const filter = { email: email };
        const updateDoc = {
          $set: {
            name: name,
            photoURL: photoURL
          }
        };

        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    ///////////////////loans/////////////////////////

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

    app.post("/loans", async (req, res) => {
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

    app.put("/loans/:id", async (req, res) => {
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

    app.delete("/loans/:id", async (req, res) => {
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

    app.put("/loans/:id", async (req, res) => {
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

    //////////////////////////////////

    app.patch("/loans/toggle-home/:id", async (req, res) => {
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

    /////////////////// application///////////////

    // ================== APPLICATION APIs ==================

    // 1. Create Loan Application (POST) - User Applies for Loan
    app.post("/applications", async (req, res) => {
      try {
        const application = req.body;

        // Default fields according to requirements
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

    // 2. Get Applications (GET) - For Admin (All) & Manager (Filter by Status)
    // Usage:
    // Admin All: /applications
    // Manager Pending: /applications?status=pending
    // Manager Approved: /applications?status=approved
    app.get("/applications", async (req, res) => {
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

    // 3. Get Applications by User Email (GET) - For Borrower My Loans
    app.get("/applications/:email", async (req, res) => {
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

    // 4. Update Application Status (PATCH) - For Manager (Approve/Reject)
    app.patch("/applications/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // 'approved' or 'rejected'
        const filter = { _id: new ObjectId(id) };

        let updateDoc = {
          $set: { status: status },
        };

        // If approved, log the approval date
        if (status === "approved") {
          updateDoc.$set.approvedAt = new Date();
        }

        const result = await applicationCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // 5. Delete/Cancel Application (DELETE) - Only if pending
    app.delete("/applications/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await applicationCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // 6. (Challenge) Update Fee Status (PATCH) - After Payment
    app.patch("/applications/payment/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { transactionId } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            feeStatus: "paid",
            transactionId: transactionId,
            paidAt: new Date(),
          },
        };

        const result = await applicationCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    //////////////////////////////////////// MANAGER ///////////
    // Manager Stats API
    app.get("/manager/stats/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // 1. Find all loans posted by this manager
        const myLoans = await loansCollection
          .find({ managerEmail: email })
          .toArray();
        const myLoanIds = myLoans.map((loan) => loan._id.toString());

        const myApplications = await applicationCollection
          .find({ loanId: { $in: myLoanIds } })
          .toArray();

        // 3. Calculate Stats
        const stats = {
          totalLoans: myLoans.length,
          totalApplications: myApplications.length,
          totalPending: myApplications.filter((app) => app.status === "pending")
            .length,
          totalApproved: myApplications.filter(
            (app) => app.status === "approved"
          ).length,
        };
        // 4. Get recent 5 applications
        const recentApplications = myApplications
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5);

        res.send({ stats, recentApplications });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    //////////////// ADMIN /////////////////////
    app.get("/admin/stats", async (req, res) => {
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

    ////////////////////////// USER STATE ///////////////////
    // ================== USER (BORROWER) STATS API ==================
    app.get("/user/stats/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // 1. Find all applications by this user
        // Note: Loan Application করার সময় ইউজার ইমেইল 'email' বা 'userEmail' ফিল্ডে সেভ করেছিলে কিনা চেক করে নিও।
        // আমি ধরে নিচ্ছি তুমি 'email' বা 'applicantEmail' নামে সেভ করবে।
        // তোমার অ্যাসাইনমেন্ট রিকোয়ারমেন্ট অনুযায়ী ফর্মের ডাটা সেভ করার সময় ফিল্ডের নাম যা দিবে, এখানে তাই লিখবে।
        const myApplications = await applicationCollection
          .find({ email: email })
          .toArray();

        // 2. Calculate Stats
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

        // 3. Get recent 5 applications
        const recentApplications = myApplications
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5);

        res.send({ stats, recentApplications });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
