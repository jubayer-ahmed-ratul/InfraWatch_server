const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

const stripe = require('stripe')(process.env.STRIPE_SECRET);


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
  const { email, name, password, uid, photo } = req.body;

  if (!email || !name) return res.status(400).json({ error: "Name and email required" });


  let query = { $or: [{ uid }, { email }] };

  let user = await usersCollection.findOne(query);

  if (user) {
 
    const updates = {};
    if (uid && !user.uid) updates.uid = uid;
    if (photo && user.photo !== photo) updates.photo = photo;

    if (Object.keys(updates).length > 0) {
      await usersCollection.updateOne({ _id: user._id }, { $set: updates });
      user = await usersCollection.findOne({ _id: user._id });
    }

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
});



app.patch("/users/premium", async (req, res) => {
  const { email } = req.body;

  const result = await usersCollection.updateOne(
    { email },
    { $set: { premium: true } }
  );

  res.json({ success: true, modified: result.modifiedCount });
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

// Make a specific user admin
app.patch("/users/make-admin", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    const result = await usersCollection.updateOne(
      { email },
      { $set: { role: "admin" } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "User not found or already admin" });
    }

    res.json({ message: `${email} is now an admin!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch("/users/block", async (req, res) => {
  try {
    const { email, blocked } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const result = await usersCollection.updateOne(
      { email },
      { $set: { blocked: !!blocked } }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

    res.json({ message: `User ${blocked ? "blocked" : "unblocked"} successfully`, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

  const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

  res.json({ message: "User deleted successfully", deletedCount: result.deletedCount });
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
// Payment related api
//////////////////////////
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { userEmail } = req.body; 

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: "Premium Membership",
              description: "Unlimited issue reporting",
            },
            unit_amount: 1000 * 100, 
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.SITE_DOMAIN}/payment-success?email=${userEmail}`, 
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/profile`,
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a Stripe checkout session for boosting an issue
app.post("/issues/:id/boost-session", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.body;

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid issue ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    if (issue.boosted) return res.status(400).json({ error: "Issue already boosted" });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: "Boost Issue",
              description: `Boosting issue: ${issue.title}`,
            },
            unit_amount: 100 * 100, 
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.SITE_DOMAIN}/boost-success?issueId=${id}&email=${userEmail}`,
      cancel_url: `${process.env.SITE_DOMAIN}/issues/${id}`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.patch("/issues/:id/boost", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid issue ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    if (issue.boosted) return res.status(400).json({ error: "Issue already boosted" });

    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { boosted: true, priority: "High" } }
    );

    res.json({ message: "Issue boosted successfully!", modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get total payments (admin dashboard)
app.get("/payments/total", async (req, res) => {
  try {
    // Fetch all successful payments from Stripe
    const payments = await stripe.paymentIntents.list({ limit: 100 }); // adjust limit if needed

    const successfulPayments = payments.data.filter(p => p.status === "succeeded");

    const totalAmount = successfulPayments.reduce((acc, payment) => acc + (payment.amount || 0), 0);

    // Convert from cents to BDT
    res.json({ total: totalAmount / 100, count: successfulPayments.length });
  } catch (err) {
    console.error(err);
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
