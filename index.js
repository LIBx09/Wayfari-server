const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// const corsOptions = {
//   origin: "http://localhost:5173", // Replace with your frontend URL in production
//   credentials: true, // Allow cookies and authentication headers
//   methods: ["GET", "POST", "PUT", "DELETE"], // Allow only necessary methods
//   allowedHeaders: ["Content-Type", "Authorization"], // Allow JWT or Firebase Auth header
// };

app.use(
  cors({
    origin: "http://localhost:5173", // Your frontend URL
    allowedHeaders: ["Content-Type", "Authorization"], // Allow Authorization header
  })
);
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.PASS_DB}@cluster0.iciu9bb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
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
    const guideApplyCollection = client.db("WayfariDB").collection("applyDB");
    const storiesCollection = client.db("WayfariDB").collection("stories");

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
      // console.log("headers", req.headers);
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        // console.log(req.headers.authorization);
        return res.status(401).send({ message: "unauthorize access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      if (!token) {
        // console.log("Token is missing after split!");
        return res.status(401).send({ message: "unauthorize access" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          // console.error("JWT Verification Error:", err);
          return res.status(401).send({ message: "unauthorize access" });
        }
        req.decoded = decoded;
        // console.log("Token verified successfully decoded!", decoded);
        next();
      });
    };

    // const verifyToken = (req, res, next) => {
    //   const authHeader = req.headers.authorization;

    //   console.log("Authorization Header:", authHeader); // Debugging

    //   if (!authHeader) {
    //     return res
    //       .status(401)
    //       .send({ message: "Unauthorized access: No token" });
    //   }

    //   const token = authHeader.split(" ")[1];

    //   if (!token) {
    //     return res
    //       .status(401)
    //       .send({ message: "Unauthorized access: Token missing" });
    //   }

    //   jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    //     if (err) {
    //       console.error("JWT Verification Error:", err); // Log JWT errors
    //       return res
    //         .status(403)
    //         .send({ message: "Unauthorized access: Invalid token" });
    //     }

    //     console.log("Decoded Token:", decoded); // Debug decoded token
    //     req.decoded = decoded;
    //     next();
    //   });
    // };

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

    //stories related Apis
    app.get("/stories/all", async (req, res) => {
      const result = await storiesCollection.find().toArray();
      res.send(result);
    });

    app.get("/stories/favorites/:email", async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.status(400).send({ message: "email is required." });
      }
      const query = { favorite: email };
      const result = await storiesCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/stories/favorite", async (req, res) => {
      const { storyId, email } = req.body;
      // console.log("id", storyId, "email", email);
      if (!storyId || !email) {
        return res
          .status(400)
          .send({ message: "story ID and Email are required." });
      }

      if (!ObjectId.isValid(storyId)) {
        return res.status(400).send({ error: "Invalid ObjectId format" });
      }

      const query = { _id: new ObjectId(storyId) };
      const update = { $addToSet: { favorite: email } };
      const result = await storiesCollection.updateOne(query, update);
      res.send(result);
    });

    app.get("/stories/sample", async (req, res) => {
      const result = await storiesCollection
        .aggregate([{ $sample: { size: 4 } }])
        .toArray();
      res.send(result);
    });

    app.delete("/stories/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await storiesCollection.deleteOne(query);
      res.send(result);
    });

    app.put("/stories/manage-images/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      // console.log("id_only", id);

      const { removeImage, addImage } = req.body;
      // console.log("remove", removeImage, "add", addImage);

      const updateQuery = {};

      if (removeImage) {
        updateQuery.$pull = { images: removeImage };
      }
      if (addImage) {
        updateQuery.$push = { images: addImage };
      }

      const result = await storiesCollection.updateOne(
        { _id: new ObjectId(id) },
        updateQuery
      );
      res.send(result);
    });

    app.get("/story/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await storiesCollection.findOne(query);
      res.send(result);
      // console.log(result);
    });

    app.get("/stories/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await storiesCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/stories", async (req, res) => {
      const storyData = req.body;
      const result = await storiesCollection.insertOne(storyData);
      res.send(result);
    });

    //guide application related APIs
    app.post("/applications", verifyToken, async (req, res) => {
      const application = req.body;
      const result = await guideApplyCollection.insertOne(application);
      res.send(result);
    });

    app.get("/applications", verifyToken, verifyAdmin, async (req, res) => {
      const result = await guideApplyCollection.find().toArray();
      res.send(result);
    });

    app.put(
      "/applications/accept/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { userEmail } = req.body;
        // console.log(id, userEmail);

        await userCollection.updateOne(
          { email: userEmail },
          { $set: { role: "guide" } }
        );

        await guideApplyCollection.deleteOne({ _id: new ObjectId(id) });
      }
    );

    app.delete(
      "/applications/reject/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await guideApplyCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    //booking related APIs
    app.post("/bookings", verifyToken, async (req, res) => {
      const bookingData = req.body;
      const result = await bookingCollection.insertOne(bookingData);
      res.send(result);
    });

    app.delete("/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/bookings/status/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;

      if (!["in-review", "accepted", "rejected"].includes(status)) {
        return res.status(400).send({ message: "Invalid status" });
      }
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status } };
      const result = await bookingCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.put("/bookings/:id", verifyToken, async (req, res) => {
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

    app.get("/bookings/all-bookings/data", verifyToken, async (req, res) => {
      const { email, role } = req.query;
      // console.log(email, role);
      let query = {};
      if (role === "tourist" && email) {
        query = { "data.touristEmail": email };
      } else if (role === "guide" && email) {
        query = {};
      }
      // console.log("query", query);
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });

    //checks admin user || guide user role
    app.get("/users/admin/guide/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);

      if (!user) {
        return res.status(404).send({ message: "User Not Found" });
      }

      const admin = user.role === "admin";
      const guide = user.role === "guide";
      // console.log("check", admin, guide);
      res.send({ admin, guide });
    });

    // app.get("/users/admin/:email", verifyToken, async (req, res) => {
    //   const email = req.params.email;
    //   console.log(email);
    //   if (email !== req.decoded.email) {
    //     return res.status(403).send({ message: "Forbidden access" });
    //   }
    //   const user = await userCollection.findOne({ email });
    //   if (!user) {
    //     return res.status(404).send({ message: "User Not Found" });
    //   }
    //   res.send({ admin: user.role === "admin" });
    // });

    // app.get("/users/guide/:email", async (req, res) => {
    //   const email = req.params.email;
    //   console.log(email);
    //   if (email !== req.decoded.email) {
    //     return res.status(403).send({ message: "Forbidden access" });
    //   }
    //   const user = await userCollection.findOne({ email });
    //   if (!user) {
    //     return res.status(404).send({ message: "User Not Found" });
    //   }
    //   res.send({ guide: user.role === "guide" });
    // });

    //users related APIs

    app.put("/users/update/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const option = { upsert: true };
      const updateDoc = req.body;
      const updateUser = {
        $set: {
          name: updateDoc.name,
          address: updateDoc.address,
          phone: updateDoc.phone,
          bio: updateDoc.bio,
          photo: updateDoc.photo,
        },
      };
      const result = await userCollection.updateOne(filter, updateUser, option);
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
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

    app.get("/users/guide/sample", async (req, res) => {
      //finding guides data
      const result = await userCollection
        .aggregate([{ $sample: { size: 6 } }])
        .toArray();
      res.send(result);
    });

    app.get("/user-search", verifyToken, verifyAdmin, async (req, res) => {
      const { searchUserName } = req.query;
      // console.log("search", searchUserName);

      let option = {};
      if (searchUserName) {
        option = { name: { $regex: searchUserName, $options: "i" } };
      }
      const result = await userCollection.find(option).toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // console.log("Received user:", user);
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        // console.log("User already exists:", existingUser);
        return res.send({ message: "User already exist", insertedId: null });
      }
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

    app.post("/package", verifyToken, verifyAdmin, async (req, res) => {
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

    //admin related apis
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const stories = await storiesCollection.estimatedDocumentCount();
      const package = await packageCollection.estimatedDocumentCount();

      const revenue = await bookingCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$paymentPrice" },
            },
          },
        ])
        .toArray();

      const totalRevenue = revenue.length > 0 ? revenue[0].totalRevenue : 0;

      const roleCounts = await userCollection
        .aggregate([
          {
            $match: {
              role: { $in: ["guide", "tourist"] },
            },
          },
          {
            $group: {
              _id: "$role",
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();

      const stats = roleCounts.reduce((acc, role) => {
        acc[role._id] = role.count;
        return acc;
      }, {});

      res.send({
        stats,
        stories,
        package,
        totalRevenue,
      });
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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
