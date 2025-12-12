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

  
    const {
      page = 1,
      limit = 10,
      search = "",
      category,
      status,
      priority,
    } = req.query;

   
    const query = {};

    if (search) {
      query.title = { $regex: search, $options: "i" }; 
    }
    if (category) query.category = category;
    if (status) query.status = status;
    if (priority) query.priority = priority;

   
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const issuesCursor = issueCollection.find(query).skip(skip).limit(parseInt(limit));
    const issues = await issuesCursor.toArray();

  
    const totalCount = await issueCollection.countDocuments(query);

    res.status(200).json({ issues, totalCount });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

/////////////////////////////////
///////////DELETE ALL ISSUES/////
/////////////////////////////////
app.delete("/issues", async (req, res) => {
  try {
    if (!issueCollection) {
      return res.status(500).send({ error: "Database not connected yet" });
    }

    const result = await issueCollection.deleteMany({}); 

    res.status(200).send({ message: "All issues deleted!", deletedCount: result.deletedCount });

  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});


////////////////////////////////////////////
///////////GET 6 PENDING ISSUES////////////
////////////////////////////////////////////
app.get("/issues/resolved", async (req, res) => {
  try {
    if (!issueCollection) {
      return res.status(500).send({ error: "Database not connected yet" });
    }

    const resolvedIssues = await issueCollection
      .find({ status: { $regex: /^resolved$/i } }) 
      .limit(6)
      .toArray();

    res.status(200).send(resolvedIssues);

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
///////////GET USER////////////
/////////////////////////////////

app.get("/users", async (req, res) => {
  try {
    const db = client.db("infraWatch_db");
    const usersCollection = db.collection("users");

    const users = await usersCollection.find({}).toArray(); 
    res.status(200).send(users);

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
