import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || "mongodb://localhost:27017/bid-game";

async function run() {
  console.log("Connecting to:", MONGO_URI);
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const db = mongoose.connection.db;
    const collName = "bids";

    const collections = await db.listCollections({ name: collName }).toArray();
    if (!collections.length) {
      console.log(`Collection '${collName}' not found.`);
      return;
    }

    const coll = db.collection(collName);
    const indexes = await coll.indexes();
    console.log("Existing indexes:");
    indexes.forEach(i => console.log(` - ${i.name}:`, i.key, i.unique ? "(unique)" : ""));

    // Find index that matches roundId:1, userId:1
    const target = indexes.find(i => {
      if (!i.key) return false;
      const keys = i.key;
      return keys.roundId === 1 && keys.userId === 1;
    });

    if (!target) {
      console.log("No index on {roundId:1, userId:1} found — nothing to drop.");
      return;
    }

    console.log(`Dropping index '${target.name}' which maps to`, target.key);
    await coll.dropIndex(target.name);
    console.log("Index dropped successfully.");
  } catch (err) {
    console.error("Error dropping index:", err);
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); } catch (e) {}
  }
}

run();
