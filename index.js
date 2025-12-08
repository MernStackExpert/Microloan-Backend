import express from "express";
const app = express();
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());
dotenv.config();

const verifyFBToken = (req , res , next) => {
  console.log('headers in the middleware ' , req.headers.authorization)
  next();
}

// mongodb
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

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

    ///////////////////Users///////////////////////////

    app.post("/users" , async (req , res) => {
      const user = req.body;
      user.createdAt = new Date();
      const email = user.email;
      const userExits = await userCollection.findOne({email})

      if(userExits){
        return res.send({message: 'user exits'})
      }

      const result = await userCollection.insertOne(user)
      res.send(result)
    })


    ///////////////////loans/////////////////////////
    // app.get("/loans", async (req, res) => {

    //   try {
    //     const { page = 1, limit = 12, search = "", category } = req.query;

    //     const filter = {};

    //     if (search) {
    //       filter.title = { $regex: search, $options: "i" };
    //     }

    //     if (category) {
    //       filter.category = category;
    //     }

    //     const skip = (Number(page) - 1) * Number(limit);

    //     const total = await loansCollection.countDocuments(filter);

    //     const data = await loansCollection
    //       .find(filter)
    //       .skip(skip)
    //       .limit(Number(limit))
    //       .toArray();

    //     res.send({
    //       total,
    //       page: Number(page),
    //       limit: Number(limit),
    //       data,
    //     });
    //   } catch (error) {
    //     res.status(500).send({ error: error.message });
    //   }
    // });
    // Get All Loans (Without Pagination Limit for Client Side Handling)
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

    ////////////////////////////////////////

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
