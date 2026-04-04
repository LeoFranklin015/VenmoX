import { MongoClient, ObjectId, type Db, type Collection } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;

let client: MongoClient | null = null;
let db: Db | null = null;

async function getDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.collection("subscription_plans").createIndex({ spender: 1 });
  await db.collection("subscribers").createIndex({ plan_id: 1 });
  await db.collection("subscribers").createIndex({ subscriber: 1 });
  return db;
}

function plans(): Promise<Collection> {
  return getDb().then((d) => d.collection("subscription_plans"));
}
function subscribers(): Promise<Collection> {
  return getDb().then((d) => d.collection("subscribers"));
}

export type SubscriptionPeriod = "day" | "week" | "month" | "year";

// --- Plans (merchant creates these) ---

export async function createPlan(data: {
  name: string;
  description: string;
  amount: string;
  period: SubscriptionPeriod;
  spender: string;
}) {
  const col = await plans();
  const result = await col.insertOne({
    ...data,
    created_at: new Date().toISOString(),
  });
  return { id: result.insertedId.toString() };
}

export async function getPlan(id: string) {
  const col = await plans();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function listPlans() {
  const col = await plans();
  return col.find().sort({ created_at: -1 }).toArray();
}

export async function deletePlan(id: string) {
  const col = await plans();
  await col.deleteOne({ _id: new ObjectId(id) });
}

// --- Subscribers (users who subscribe to a plan) ---

export async function addSubscriber(data: {
  planId: string;
  subscriber: string;
  permissionId: string;
}) {
  const col = await subscribers();
  const result = await col.insertOne({
    plan_id: data.planId,
    subscriber: data.subscriber,
    permissionId: data.permissionId,
    status: "active",
    lastChargedAt: null,
    created_at: new Date().toISOString(),
  });
  return { id: result.insertedId.toString() };
}

export async function getSubscribersByPlan(planId: string) {
  const col = await subscribers();
  return col.find({ plan_id: planId }).sort({ created_at: -1 }).toArray();
}

export async function getSubscribersByAddress(address: string) {
  const col = await subscribers();
  return col.find({ subscriber: address }).sort({ created_at: -1 }).toArray();
}

export async function getSubscriber(id: string) {
  const col = await subscribers();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function revokeSubscriber(id: string) {
  const col = await subscribers();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { status: "revoked" } });
}

export async function updateLastCharged(id: string) {
  const col = await subscribers();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { lastChargedAt: new Date().toISOString() } });
}
