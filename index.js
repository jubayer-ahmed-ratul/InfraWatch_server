const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient } = require('mongodb');

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



app.get("/", (req, res) => {
  res.send("Backend running! POST /issues is available.");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
