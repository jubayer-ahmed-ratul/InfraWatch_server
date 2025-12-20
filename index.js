const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

const stripe = require("stripe")(process.env.STRIPE_SECRET);

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connect
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bsfywqv.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

let db, usersCollection, issuesCollection, staffCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log("MongoDB Connected!");
    db = client.db("infraWatch_db");
    usersCollection = db.collection("users");
    issuesCollection = db.collection("issues");
    staffCollection = db.collection("staff");
  } catch (err) {
    console.error("DB connection error:", err);
  }
}

connectDB();
//////////////////////////
// STAFF ROUTES
//////////////////////////

// Middleware to check if requester is admin
const checkAdmin = async (req, res, next) => {
  const { uid } = req.body;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  const user = await usersCollection.findOne({ uid });
  if (!user || user.role !== "admin")
    return res.status(403).json({ error: "Admin only" });

  next();
};

// Get all staff

app.get("/staff", async (req, res) => {
  try {
    const staffList = await staffCollection.find({}).toArray();
    res.json(staffList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new staff 
app.post("/staff", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, password required" });
    }

    const existing = await staffCollection.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "Staff already exists" });
    }

    const staff = {
      name,
      email,
      phone: phone || null,
      password,
      role: "staff",
      createdAt: new Date(),
    };

    await staffCollection.insertOne(staff);
    res.status(201).json({ message: "Staff added successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN API 

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

 
    let user = await usersCollection.findOne({ email });
    let collection = "users";


    if (!user) {
      user = await staffCollection.findOne({ email });
      collection = "staff";
    }

    if (!user) return res.status(404).json({ error: "User not found" });

  
    if (user.password && user.password !== password) {
      return res.status(401).json({ error: "Wrong password" });
    }

  
    const role = user.role || (collection === "staff" ? "staff" : "user");

    res.json({
      message: "Login successful",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/staff/from-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    
    const exists = await staffCollection.findOne({ email: user.email });
    if (exists) {
      return res.status(400).json({ error: "User already staff" });
    }

    const staff = {
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      password: user.password || null,
      role: "staff",
      fromUserId: user._id,
      createdAt: new Date(),
    };

    await staffCollection.insertOne(staff);

    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { role: "staff" } }
    );

    res.json({
      message: `${user.name} is now staff`,
      staff,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete staff by ID 
app.delete("/staff/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid staff ID" });
    }

    const result = await staffCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/staff/:id", checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid staff ID" });

    const staff = await staffCollection.findOne({ _id: new ObjectId(id) });
    if (!staff) return res.status(404).json({ error: "Staff not found" });

    const result = await staffCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    res.json({
      message: "Staff updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/staff/from-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await usersCollection.findOne({
      _id: new ObjectId(userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

  
    const exists = await staffCollection.findOne({ email: user.email });
    if (exists) {
      return res.status(400).json({ error: "User already staff" });
    }

    const staff = {
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      password: user.password || null,
      role: "staff",
      fromUserId: user._id,
      createdAt: new Date(),
    };

    await staffCollection.insertOne(staff);

    res.json({
      message: `${user.name} is now staff`,
      staff,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//////////////////////////
// ASSIGN STAFF TO ISSUE
//////////////////////////

app.patch("/issues/:id/assign-staff", async (req, res) => {
  try {
    const { id } = req.params;
    const { staffId } = req.body;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid issue ID" });
    if (!ObjectId.isValid(staffId))
      return res.status(400).json({ error: "Invalid staff ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const staff = await staffCollection.findOne({ _id: new ObjectId(staffId) });
    if (!staff) return res.status(404).json({ error: "Staff not found" });

    // Create timeline entry
    const timelineEntry = {
      status: "In Progress",
      updatedBy: "Admin",
      message: `Assigned to staff: ${staff.name}`,
      date: new Date(),
    };

    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          assignedStaff: {
            staffId: staff._id,
            name: staff.name,
            email: staff.email,
            phone: staff.phone,
          },
          status: "In Progress",
        },
        $push: { timeline: timelineEntry },
      }
    );

    res.json({
      message: "Staff assigned successfully",
      modifiedCount: result.modifiedCount,
      assignedStaff: staff,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove staff assignment from an issue
app.patch("/issues/:id/unassign-staff", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid issue ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const timelineEntry = {
      status: "Pending",
      updatedBy: "Admin",
      message: "Staff assignment removed",
      date: new Date(),
    };

    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          assignedStaff: null,
          status: "Pending",
        },
        $push: { timeline: timelineEntry },
      }
    );

    res.json({
      message: "Staff unassigned successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/staff/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid staff ID" });
    }

    const staff = await staffCollection.findOne({ _id: new ObjectId(id) });
    if (!staff) return res.status(404).json({ error: "Staff not found" });

    res.status(200).json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get staff by email
app.get("/staff/email/:email", async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const staff = await staffCollection.findOne({ email });
    if (!staff) return res.status(404).json({ error: "Staff not found" });

    res.status(200).json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get issues assigned to a staff by email
app.get("/issues/assigned/email/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!email) return res.status(400).json({ error: "Email is required" });

 
    const staff = await staffCollection.findOne({ email });
    if (!staff) return res.status(404).json({ error: "Staff not found" });

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { "assignedStaff.staffId": staff._id };

    const issuesCursor = issuesCollection
      .find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const issues = await issuesCursor.toArray();
    const totalCount = await issuesCollection.countDocuments(query);

    res.status(200).json({
      issues,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

//////////////////////////
// USER ROUTES
//////////////////////////


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

  if (!email || !name)
    return res.status(400).json({ error: "Name and email required" });

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
  const insertedUser = await usersCollection.findOne({
    _id: result.insertedId,
  });

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

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "User not found" });

    res.json({
      message: `User ${blocked ? "blocked" : "unblocked"} successfully`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id))
    return res.status(400).json({ error: "Invalid user ID" });

  const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0)
    return res.status(404).json({ error: "User not found" });

  res.json({
    message: "User deleted successfully",
    deletedCount: result.deletedCount,
  });
});

//////////////////////////
// ISSUE ROUTES
//////////////////////////


app.get("/issues", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      category,
      status,
      priority,
    } = req.query;
    const query = {};

    if (search) query.title = { $regex: search, $options: "i" };
    if (category) query.category = category;
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const issuesCursor = issuesCollection
      .find(query)
      .skip(skip)
      .limit(parseInt(limit));
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
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid ID" });

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

    const issuesCursor = issuesCollection
      .find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const issues = await issuesCursor.toArray();
    const totalCount = await issuesCollection.countDocuments(query);

    res.status(200).json({
      issues,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
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

    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    if (issue.status.toLowerCase() !== "pending") {
      return res
        .status(403)
        .json({ error: "Only 'Pending' issues can be edited." });
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

    res.status(200).json({
      message: "Issue updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/issues/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    if (issue.status.toLowerCase() !== "pending") {
      return res
        .status(403)
        .json({ error: "Only 'Pending' issues can be deleted." });
    }

    const result = await issuesCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json({
      message: "Issue deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/issues/:id/upvote", async (req, res) => {
  try {
    const id = req.params.id;
    const { userId } = req.body;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    if (issue.createdBy.userId === userId)
      return res.status(403).json({ error: "Cannot upvote own issue" });
    if (issue.userUpvoted?.includes(userId))
      return res.status(400).json({ error: "Already upvoted" });

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

    const issuesCursor = issuesCollection
      .find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const issues = await issuesCursor.toArray();
    const totalCount = await issuesCollection.countDocuments(query);

    res.status(200).json({
      issues,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all issues
app.delete("/issues", async (req, res) => {
  try {
    const result = await issuesCollection.deleteMany({});
    res.status(200).json({
      message: "All issues deleted!",
      deletedCount: result.deletedCount,
    });
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

// Create a Stripe checkout session 
app.post("/issues/:id/boost-session", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.body;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid issue ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    if (issue.boosted)
      return res.status(400).json({ error: "Issue already boosted" });

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

    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid issue ID" });

    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    if (issue.boosted)
      return res.status(400).json({ error: "Issue already boosted" });

    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { boosted: true, priority: "High" } }
    );

    res.json({
      message: "Issue boosted successfully!",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get total payments (admin dashboard)
app.get("/payments/total", async (req, res) => {
  try {
    const payments = await stripe.paymentIntents.list({ limit: 100 });

    const successfulPayments = payments.data.filter(
      (p) => p.status === "succeeded"
    );

    const totalAmount = successfulPayments.reduce(
      (acc, payment) => acc + (payment.amount || 0),
      0
    );

    res.json({ total: totalAmount / 100, count: successfulPayments.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// Get all successful payments (for admin table)
app.get("/payments/list", async (req, res) => {
  try {
    const { fromDate } = req.query;
    let filter = {};

    if (fromDate) {
      const fromTimestamp = Math.floor(new Date(fromDate).getTime() / 1000);
      filter = { created: { gte: fromTimestamp } };
    }

    const payments = await stripe.paymentIntents.list({
      limit: 100,
      ...filter,
    });

    const paymentPromises = payments.data
      .filter((p) => p.status === "succeeded")
      .map(async (p) => {
        let userName = "Unknown User";
        let userEmail = p.receipt_email || "N/A";

        if (p.metadata && p.metadata.userId) {
          const user = await usersCollection.findOne({
            _id: new ObjectId(p.metadata.userId),
          });
          if (user) {
            userName = user.name;
            userEmail = user.email;
          }
        } else if (userEmail !== "N/A") {
          const user = await usersCollection.findOne({
            email: userEmail,
          });
          if (user) {
            userName = user.name;
          }
        }

        return {
          id: p.id,
          amount: p.amount / 100,
          currency: p.currency.toUpperCase(),
          email: userEmail,
          name: userName,
          date: new Date(p.created * 1000),
          status: p.status,
        };
      });

    const successfulPayments = await Promise.all(paymentPromises);
    res.json(successfulPayments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

//////////////////////////
// STAFF ISSUE STATUS UPDATE
//////////////////////////

// Update issue status 
app.patch("/issues/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, staffEmail, comment } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid issue ID" });
    }

    if (!newStatus || !staffEmail) {
      return res
        .status(400)
        .json({ error: "New status and staff email are required" });
    }

   
    const staff = await staffCollection.findOne({ email: staffEmail });
    if (!staff) {
      return res.status(404).json({ error: "Staff not found" });
    }

   
    const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
    if (!issue) {
      return res.status(404).json({ error: "Issue not found" });
    }

   
    if (!issue.assignedStaff || issue.assignedStaff.email !== staffEmail) {
      return res
        .status(403)
        .json({ error: "You are not assigned to this issue" });
    }

 
    const allowedTransitions = {
      Pending: ["In Progress"],
      "In Progress": ["Working"],
      Working: ["Resolved"],
      Resolved: ["Closed"],
     
      Working: ["In Progress", "Resolved"],
      Resolved: ["Working", "Closed"],
    };

    const currentStatus = issue.status;

   
    if (
      !allowedTransitions[currentStatus] ||
      !allowedTransitions[currentStatus].includes(newStatus)
    ) {
      return res.status(400).json({
        error: `Cannot change status from ${currentStatus} to ${newStatus}`,
        allowedTransitions: allowedTransitions[currentStatus] || [],
      });
    }

 
    const timelineEntry = {
      status: newStatus,
      updatedBy: staff.name,
      message:
        comment || `Status changed from ${currentStatus} to ${newStatus}`,
      date: new Date(),
      staffId: staff._id,
      staffEmail: staff.email,
    };


    const result = await issuesCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: newStatus,
          updatedAt: new Date(),
        },
        $push: {
          timeline: timelineEntry,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ error: "Failed to update status" });
    }


    const updatedIssue = await issuesCollection.findOne({
      _id: new ObjectId(id),
    });

    res.json({
      message: "Status updated successfully",
      issue: updatedIssue,
      timelineEntry,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/issues/assigned/staff/:staffId/filtered", async (req, res) => {
  try {
    const { staffId } = req.params;
    const {
      status,
      priority,
      page = 1,
      limit = 10,
      sortBy = "boosted",
      sortOrder = "desc",
    } = req.query;

    if (!ObjectId.isValid(staffId)) {
      return res.status(400).json({ error: "Invalid staff ID" });
    }


    const query = { "assignedStaff.staffId": new ObjectId(staffId) };

    if (status) {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

   
    const sort = {};
    if (sortBy === "boosted") {
      sort.boosted = -1; 
      sort.createdAt = -1; 
    } else {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

 
    const issues = await issuesCollection
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const totalCount = await issuesCollection.countDocuments(query);

    res.status(200).json({
      issues,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      filters: { status, priority },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/issues/assigned/staff/:staffId/all", async (req, res) => {
  try {
    const { staffId } = req.params;
    const { status, priority, category, startDate, endDate, search } =
      req.query;

    if (!ObjectId.isValid(staffId)) {
      return res.status(400).json({ error: "Invalid staff ID" });
    }


    const query = { "assignedStaff.staffId": new ObjectId(staffId) };

    if (status) {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    if (category) {
      query.category = category;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

  
    const sort = { boosted: -1, createdAt: -1 };

    const issues = await issuesCollection.find(query).sort(sort).toArray();

 
    const statusCounts = {
      Pending: await issuesCollection.countDocuments({
        ...query,
        status: "Pending",
      }),
      "In Progress": await issuesCollection.countDocuments({
        ...query,
        status: "In Progress",
      }),
      Working: await issuesCollection.countDocuments({
        ...query,
        status: "Working",
      }),
      Resolved: await issuesCollection.countDocuments({
        ...query,
        status: "Resolved",
      }),
      Closed: await issuesCollection.countDocuments({
        ...query,
        status: "Closed",
      }),
      total: issues.length,
    };

    res.status(200).json({
      issues,
      statusCounts,
      totalCount: issues.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
app.patch("/staff/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid staff ID" });

    const staff = await staffCollection.findOne({ _id: new ObjectId(id) });
    if (!staff) return res.status(404).json({ error: "Staff not found" });

  
    const allowedUpdates = {};
    if (updates.name) allowedUpdates.name = updates.name;
    if (updates.phone) allowedUpdates.phone = updates.phone;
    if (updates.photo) allowedUpdates.photo = updates.photo;

    const result = await staffCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: allowedUpdates }
    );

    res.json({
      message: "Profile updated successfully",
      modifiedCount: result.modifiedCount,
    });
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
