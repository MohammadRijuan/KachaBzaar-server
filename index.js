const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 5000;



// Middlewares
app.use(cors());
app.use(express.json());
app.use(cookieParser());


const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.i0ofiio.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Create client
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Main async function
async function run() {
    try {
        client.connect();

        const userCollection = client.db('KachaBazaar-usersDB').collection('users');
        const productCollection = client.db('KachaBazaar-productsDB').collection('products');
        const advertisementCollection = client.db('KachaBazaar-adDB').collection('ads');

        //advertisement related api
        // Create advertisement
        app.post("/advertisements", async (req, res) => {
            try {
                const advertisement = req.body;
                const result = await advertisementCollection.insertOne(advertisement);
                res.send(result);
            } catch (error) {
                console.error("Error adding advertisement:", error);
                res.status(500).send({ message: "Failed to add advertisement." });
            }
        });

        // Get vendor-specific advertisements
        app.get("/advertisements", async (req, res) => {
            const vendorEmail = req.query.vendorEmail;
            const query = vendorEmail ? { vendorEmail } : {};
            const result = await advertisementCollection.find(query).toArray();
            res.send(result);
        });


        // GET all ads (for admin)
        app.get("/advertisements", async (req, res) => {
            const result = await advertisementCollection.find().toArray();
            res.send(result);
        });

        // PATCH ad status (approve/update)
        app.patch("/advertisements/:id", async (req, res) => {
            const { id } = req.params;
            const update = req.body;

            const result = await advertisementCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: update }
            );

            res.send(result);
        });

        // DELETE advertisement 
        app.delete("/advertisements/:id", async (req, res) => {
            const { id } = req.params;
            const result = await advertisementCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        app.get("/advertisements/approved", async (req, res) => {
            try {
                const ads = await advertisementCollection.find({ status: "approved" }).toArray();
                res.send(ads);
            } catch (error) {
                console.error("Error fetching approved ads:", error);
                res.status(500).send({ message: "Failed to fetch ads" });
            }
        });



        //product related api

        // Add product
        app.post("/products", async (req, res) => {
            const product = req.body;
            const result = await productCollection.insertOne(product);
            res.send(result);
        });

        // Get vendor's own products
        app.get("/products/vendor/:email", async (req, res) => {
            const email = req.params.email;
            const products = await productCollection.find({ vendorEmail: email }).toArray();
            res.send(products);
        });

        // Get all products
        app.get("/products", async (req, res) => {
            const products = await productCollection.find().toArray();
            res.send(products);
        });

        app.get('/approved-products', async (req, res) => {
            try {
                const approvedProducts = await productCollection.find({ status: "approved" }).toArray();
                res.send(approvedProducts);
            } catch (err) {
                res.status(500).send({ success: false, message: "Server Error", error: err.message });
            }
        });


        app.get("/products/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const product = await productCollection.findOne({ _id: new ObjectId(id) });
                if (!product) return res.status(404).send({ error: "Not Found" });
                res.send(product);
            } catch (err) {
                res.status(400).send({ error: "Invalid ID" });
            }
        });

        // Approve or reject product
        app.patch('/products/:id/status', async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;

            if (!['approved', 'rejected', 'pending'].includes(status)) {
                return res.status(400).send({ message: "Invalid status value" });
            }

            try {
                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: `Product ${status}` });
                } else {
                    res.status(404).send({ success: false, message: "Product not found or already has this status" });
                }
            } catch (error) {
                console.error("Error updating status:", error);
                res.status(500).send({ success: false, message: "Server error", error: error.message });
            }
        });

        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;

            try {
                const result = await productCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount > 0) {
                    res.send({ success: true, message: "Product deleted", deletedCount: result.deletedCount });
                } else {
                    res.status(404).send({ success: false, message: "Product not found" });
                }
            } catch (err) {
                console.error("Delete error:", err);
                res.status(500).send({ success: false, message: "Server error", error: err.message });
            }
        });



        // vendor related api
        app.patch('/users/vendor-request', async (req, res) => {
            const { email, shopName, phone } = req.body;

            try {
                const result = await userCollection.updateOne(
                    { email },
                    {
                        $set: {
                            vendorStatus: 'pending',
                            vendorInfo: { shopName, phone }
                        }
                    }
                );

                res.send({ success: true });
            } catch (err) {
                res.status(500).send({ message: 'Failed to submit request', error: err.message });
            }
        });


        // Get all pending vendors
        app.get("/users/vendors/pending", async (req, res) => {
            const vendors = await userCollection.find({ vendorStatus: "pending" }).toArray();
            res.send(vendors);
        });

        // Approve or reject vendor request
        app.patch("/users/:id/vendor-status", async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            try {
                const result = await userCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            vendorStatus: status,
                            role: status === "approved" ? "vendor" : "user"
                        }
                    }
                );
                res.send({ success: true });
            } catch (err) {
                res.status(500).send({ message: "Error updating vendor status", error: err.message });
            }
        });


        // POST: add user
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // GET: all users
        app.get('/users', async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        // PATCH: update user
        app.patch('/users', async (req, res) => {
            const { email, lastSignInTime } = req.body;
            const filter = { email };
            const updateDoc = {
                $set: { lastSignInTime }
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.get('/users/:email/role', async (req, res) => {
            try {
                const email = req.params.email;

                if (!email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const user = await userCollection.findOne({ email });

                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send({ role: user.role || 'user' });
            } catch (error) {
                console.error('Error getting user role:', error);
                res.status(500).send({ message: 'Failed to get role' });
            }
        });


        app.patch('/users/:id/role', async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;

            try {
                const result = await userCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: `User role updated to ${role}` });
                } else {
                    res.status(404).send({ success: false, message: 'User not found or already has this role.' });
                }
            } catch (err) {
                res.status(500).send({ success: false, message: 'Internal Server Error', error: err.message });
            }
        });


        // POST: logout
        app.post('/logout', (req, res) => {
            res.clearCookie('token');
            res.status(200).json({ message: 'Logged out successfully' });
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }


}

run().catch(console.dir);

// Default route
app.get('/', (req, res) => {
    res.send('kachaBazaar server is running');
});

// Listen
app.listen(port, () => {
    console.log(`kachaBazaar Server is running on http://localhost:${port}`);
});
