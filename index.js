const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connect
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bsfywqv.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

let db, usersCollection, issuesCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log("MongoDB Connected!");
    db = client.db("infraWatch_db");
    usersCollection = db.collection("users");
    issuesCollection = db.collection("issues");
  } catch (err) {
    console.error("DB connection error:", err);
  }
}

connectDB();

//////////////////////////
// USER ROUTES
//////////////////////////

// Get all users
app.get("/users", async (req, res) => {
  try {
    const users = await usersCollection.find({}).toArray();
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post("/users", async (req, res) => {
  try {
    const { email, name, password, uid, photo } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "Name and email are required" });
    }

 
    let query;
    if (uid) {
      query = { uid }; 
    } else {
      query = { email }; 
    }

    let user = await usersCollection.findOne(query);

    if (user) {
      return res.status(200).json(user); 
    }

    
    const newUser = {
      name,
      email,
      uid: uid || null,         
      photo: photo || null,      
      password: password || null, 
      premium: false,
      blocked: false,
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    const insertedUser = await usersCollection.findOne({ _id: result.insertedId });

    res.status(201).json(insertedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get single user by ID
app.get("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await usersCollection.findOne({ _id: new ObjectId(id) });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//////////////////////////
// ISSUE ROUTES
//////////////////////////

// Get issues 
app.get("/issues", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", category, status, priority } = req.query;
    const query = {};

    if (search) query.title = { $regex: search, $options: "i" };
    if (category) query.category = category;
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const issuesCursor = issuesCollection.find(query).skip(skip).limit(parseInt(limit));
    const issues = await issuesCursor.toArray();

    const totalCount = await issuesCollection.countDocuments(query);

    res.status(200).json({ issues, totalCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get resolved issues 
app.get("/issues/resolved", async (req, res) => {
  try {
    const resolvedIssues = await issuesCollection
      .find({ status: { $regex: /^resolved$/i } })
      .limit(6)
      .toArray();
    res.status(200).json(resolvedIssues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single issue by ID
app.get("/issues/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    res.status(200).json(issue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/issues/user/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { "createdBy.userEmail": email };

    const issuesCursor = issuesCollection.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const issues = await issuesCursor.toArray();
    const totalCount = await issuesCollection.countDocuments(query);

    res.status(200).json({ 
      issues, 
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




app.post("/issues", async (req, res) => {
  try {
    const issue = req.body;
    if (!issue.title || !issue.createdBy?.userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    issue.status = "Pending";
    issue.priority = issue.priority || "Normal";
    issue.upvotes = 0;
    issue.userUpvoted = [];
    issue.timeline = [
      {
        status: "Pending",
        updatedBy: issue.createdBy.userId,
        message: "Issue reported",
        date: new Date(),
      },
    ];
    issue.createdAt = new Date();

    const result = await issuesCollection.insertOne(issue);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.patch("/issues/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    if (issue.status.toLowerCase() !== "pending") {
      return res.status(403).json({ error: "Only 'Pending' issues can be edited." });
    }

    updates.updatedAt = new Date();

    if (updates.status && updates.status !== issue.status) {
      if (!updates.timeline) updates.timeline = [];
      updates.timeline.push({
        status: updates.status,
        updatedBy: issue.createdBy.userId,
        message: `Status changed to ${updates.status}`,
        date: new Date(),
      });
    }

    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    res.status(200).json({ message: "Issue updated successfully", modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.delete("/issues/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    if (issue.status.toLowerCase() !== "pending") {
      return res.status(403).json({ error: "Only 'Pending' issues can be deleted." });
    }

    const result = await issuesCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json({ message: "Issue deleted successfully", deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.patch("/issues/:id/upvote", async (req, res) => {
  try {
    const id = req.params.id;
    const { userId } = req.body;

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    if (issue.createdBy.userId === userId) return res.status(403).json({ error: "Cannot upvote own issue" });
    if (issue.userUpvoted?.includes(userId)) return res.status(400).json({ error: "Already upvoted" });

    await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $inc: { upvotes: 1 }, $push: { userUpvoted: userId } }
    );

    res.status(200).json({ message: "Upvoted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get issues by user email
app.get("/issues/user/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
 
    const query = { "createdBy.email": email };
    
    const issuesCursor = issuesCollection.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 }); 
    
    const issues = await issuesCursor.toArray();
    const totalCount = await issuesCollection.countDocuments(query);

    res.status(200).json({ 
      issues, 
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Delete all issues 
app.delete("/issues", async (req, res) => {
  try {
    const result = await issuesCollection.deleteMany({});
    res.status(200).json({ message: "All issues deleted!", deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//////////////////////////
// SERVER INFO
//////////////////////////
app.get("/", (req, res) => {
  res.send("Backend running! Citizen & Issues API is live.");
});

app.listen(port, () => console.log(`Server running on port ${port}`));
