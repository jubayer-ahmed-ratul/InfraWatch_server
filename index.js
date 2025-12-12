const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb');

const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

// MongoDB connect
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bsfywqv.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri);

let issueCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log("MongoDB Connected!");

    const db = client.db("infraWatch_db");
    issueCollection = db.collection("issues");
  } catch (err) {
    console.log("DB Error:", err);
  }
}

connectDB();


/////////////////////////////////
///////////GET  ISSUES////////
/////////////////////////////////
app.get("/issues", async (req, res) => {
  try {
    if (!issueCollection) {
      return res.status(500).send({ error: "Database not connected yet" });
    }

    const issues = await issueCollection.find().toArray();
    res.status(200).send(issues);

  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

/////////////////////////////////
///////////GET ISSUE BY ID//////
/////////////////////////////////
app.get("/issues/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid ID format" });
    }

    const issue = await issueCollection.findOne({ _id: new ObjectId(id) });

    if (!issue) {
      return res.status(404).send({ error: "Issue not found" });
    }

    res.status(200).send(issue);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

/////////////////////////////////
///////////POST ISSUE////////////
/////////////////////////////////
app.post("/issues", async (req, res) => {
  try {
    const issue = req.body;

    if (!issue) {
      return res.status(400).send({ error: "No issue data provided" });
    }

    const result = await issueCollection.insertOne(issue);
    res.status(201).send(result);

  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

/////////////////////////////////
///////////POST USER////////////
/////////////////////////////////
app.post("/users", async (req, res) => {
  try {
    const user = req.body;

    if (!user || !user.email) {
      return res.status(400).send({ error: "Invalid user data" });
    }

    const db = client.db("infraWatch_db");
    const usersCollection = db.collection("users");

    const result = await usersCollection.insertOne(user);
    res.status(201).send(result);

  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});




app.get("/", (req, res) => {
  res.send("Backend running! POST /issues is available.");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
