const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.niilz.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// const collection = client.db("test").collection("devices");

async function run(){
    try{
        await client.connect();
        console.log('database connected');
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');
        
        app.get('/services', async(req,res)=>{
            const query = {};
            const cursor = serviceCollection.find(query);
            const result = await cursor.toArray();

            res.send(result);
        })

        app.post('/booking', async(req,res)=>{
            const booking = req.body;
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
            const exists = await bookingCollection.findOne(query);
            if(exists){
                return res.send({success: false, booking: exists})
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({success: true, result});
        })
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
