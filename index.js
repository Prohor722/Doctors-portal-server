const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const jwt = require('jsonwebtoken');

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.niilz.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// const collection = client.db("test").collection("devices");

function verifyJWT(req,res,next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send({message: 'unauthorized access.'});
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded){
        if(err){
            return res.status(403).send({message: 'Forbidden access'});
        }
        req.decoded = decoded;
        next();
    })
}

async function run(){
    try{
        await client.connect();
        console.log('database connected');
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');
        const userCollection = client.db('doctors_portal').collection('user');
        
        app.get('/services', async(req,res)=>{
            const query = {};
            const cursor = serviceCollection.find(query);
            const result = await cursor.toArray();

            res.send(result);
        })

        app.get('/user',verifyJWT, async(req,res)=>{
            const users = await userCollection.find().toArray();

            res.send(users);
        })

        app.put('/user/:email',async(req,res)=>{
            const email =  req.params.email;
            const user = req.body;
            const filter = { email};
            const options = {upsert: true};
            const updateDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn : '1h'})
            res.send({result, token});

        })

        app.get('/booking',verifyJWT, async(req,res)=>{
            const patientEmail = req.query.email;
            const decodedEmail = req.decoded.email;
            if(decodedEmail===patientEmail){
                const query = { patientEmail };
                const bookings = await bookingCollection.find(query).toArray();
                res.send(bookings);
            }
            else{
                return res.status(403).send({message: "Forbidden access."});
            }
            
        })

        app.post('/booking', async(req,res)=>{
            const booking = req.body;
            console.log(booking);
            const query = {treatment: booking.treatment, date: booking.date, patientName: booking.patientName};
            const exists = await bookingCollection.findOne(query);
            if(exists){
                return res.send({success: false, booking: exists})
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({success: true, result});
        })

        app.get('/available', async(req,res)=>{
            const date = req.query.date;
            const services = await serviceCollection.find().toArray();
            const query = {date};
            const bookings = await bookingCollection.find(query).toArray();

            services.forEach(service=>{
              const serviceBookings = bookings.filter(b=> b.treatment===service.name);
              
              const bookedSlots = serviceBookings.map(s=> s.slot);

              const available = service.slots.filter(slot => !bookedSlots.includes(slot));
              service.slots = available;
            })

            res.send(services);
        });

    }
    finally{

    }
}

run().catch(console.dir());

app.get('/',(req,res)=>{
    res.send("Doctors Portal is running.")
})

app.listen(port, ()=>{
    console.log("port: ",port,"is running.");
})
