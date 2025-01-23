const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.PASS_DB}@cluster0.iciu9bb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    //Collections
    const packageCollection = client.db("WayfariDB").collection("packages");
    const userCollection = client.db("WayfariDB").collection("users");
    const bookingCollection = client.db("WayfariDB").collection("bookingDB");

    //jwt related APIs...//
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "4h",
      });
      res.send({ token });
    });

    //middlewares
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorize access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorize access" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorize access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      if (!req.decoded?.email) {
        return res
          .status(400)
          .send({ message: "Invalid token or email missing" });
      }
      const query = { email: req.decoded.email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyGuide = async (req, res, next) => {
      if (!req.decoded?.email) {
        return res
          .status(400)
          .send({ message: "Invalid token or email missing" });
      }
      const query = { email: req.decoded.email };
      const user = await userCollection.findOne(query);
      const isGuide = user.role === "guide";
      if (!isGuide) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //booking related APIs
    app.post("/bookings", async (req, res) => {
      const bookingData = req.body;
      const result = await bookingCollection.insertOne(bookingData);
      res.send(result);
    });

    app.put("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          transactionId: payment.transactionId,
          paymentDate: payment.date,
          paymentPrice: payment.price,
          paymentEmail: payment.email,
          status: "in-review",
        },
      };
      const result = await bookingCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });

    app.get("/bookings", async (req, res) => {
      const { email, role } = req.query;
      let query = {};
      if (role === "tourist" && email) {
        query = { "data.touristEmail": email };
      } else if (role === "guide" && email) {
        query = {};
      }
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    //checks admin user || guide user role
    app.get("/users/admin/guide/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);

      if (!user) {
        return res.status(404).send({ message: "User Not Found" });
      }

      const admin = user.role === "admin";
      const guide = user.role === "guide";

      res.send({ admin, guide });
    });

    //users related APIs
    app.get("/users", verifyToken, async (req, res) => {
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/all/guide", async (req, res) => {
      //finding guides data
      const guides = await userCollection.find({ role: "guide" }).toArray();
      res.send(guides);
    });

    app.get("/users/all/guide/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await userCollection.findOne(query);
        if (!result) {
          return res.status(404).send({ error: "Guide not found" });
        }
        res.status(200).send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.get("/users/guide/limit", async (req, res) => {
      //finding guides data
      const guides = await userCollection
        .find({ role: "guide" })
        .limit(6)
        .toArray();
      res.send(guides);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //package Relate APIs...//
    app.get("/package/details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await packageCollection.findOne(query);
      res.send(result);
    });

    app.get("/package", async (req, res) => {
      const result = await packageCollection.find().toArray();
      res.send(result);
    });

    app.get("/package/sample", async (req, res) => {
      const result = await packageCollection
        .aggregate([{ $sample: { size: 3 } }])
        .toArray();
      res.send(result);
    });

    app.post("/package", async (req, res) => {
      const packageData = req.body;
      const result = await packageCollection.insertOne(packageData);
      res.send(result);
    });

    //payment related APIs...//
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Wayfari-Tourism Going On");
});
app.listen(port, () => {
  console.log(`Tourism On port: ${port}`);
});
