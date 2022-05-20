const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const jwt = require("jsonwebtoken");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.niilz.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
// const collection = client.db("test").collection("devices");

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access." });
  }

  const token = authHeader.split(" ")[1];
  
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    console.log("database connected");
    const serviceCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client.db("doctors_portal").collection("booking");
    const userCollection = client.db("doctors_portal").collection("user");
    const doctorCollection = client.db("doctors_portal").collection("doctors");
    const paymentCollection = client.db("doctors_portal").collection("payments");

    //verify admin
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });

      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "You do not have that access." });
      }
    };

    //for payment
    app.post('/create-payment-intent', verifyJWT,async(req,res)=>{
          const service = req.body;
          const price = service.price;
          const amount = price*100;
          const paymentIntent = await stripe.paymentIntents.create({
              amount: amount,
              currency: 'usd',
              payment_method_types: ['card']
          });

          res.send({clientSecret: paymentIntent.client_secret})
    })

    //get services names for adding doctor
    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const result = await cursor.toArray();

      res.send(result);
    });

    //get all users for admin
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();

      res.send(users);
    });

    //checking if the user is admin or not
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    //set admin by checking the current user
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //users get token when login or signup
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ result, token });
    });

    //get all bookings for that user
    app.get("/booking", verifyJWT, async (req, res) => {
      const patientEmail = req.query.email;
      const decodedEmail = req.decoded.email;
      if (decodedEmail === patientEmail) {
        const query = { patientEmail };
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden access." });
      }
    });

    //get booking for payment
    app.get('/booking/:id',verifyJWT, async(req,res)=>{
        const id = req.params.id;
        const query = {_id: ObjectId(id)}
        const booking = await bookingCollection.findOne(query);
        res.send(booking);
    })

    //post a booking
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patientName: booking.patientName,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({ success: true, result });
    });

    //
    app.patch('/booking/:id', verifyJWT,async(req,res)=>{
        const id = req.params.id;
        const payment = req.body;
        const query = {_id: ObjectId(id)};
        const updateDoc = {
            $set:{
                paid: true,
                transactionId: payment.transactionId,
            }
        }

        const result = await paymentCollection.insertOne(payment);
        const updatedBooking = await bookingCollection.updateOne(query,updateDoc);
        res.send(updateDoc)

    })

    //get available slots for booking
    app.get("/available", async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();
      const query = { date };
      const bookings = await bookingCollection.find(query).toArray();

      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (b) => b.treatment === service.name
        );

        const bookedSlots = serviceBookings.map((s) => s.slot);

        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        service.slots = available;
      });

      res.send(services);
    });

    //get doctors list to show
    app.get('/doctor',verifyJWT,verifyAdmin, async(req,res)=>{
        const doctors = await doctorCollection.find().toArray();
        res.send(doctors);
    })

    //add doctor
    app.post("/doctor", verifyJWT, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });
    
    //delete doctor
    app.delete("/doctor/:id", verifyJWT, async (req, res) => {
      const id = ObjectId(req.params.id);
      console.log(id);
      const filter={_id: id};
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.dir());

app.get("/", (req, res) => {
  res.send("Doctors Portal is running.");
});

app.listen(port, () => {
  console.log("port: ", port, "is running.");
});
