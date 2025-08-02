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
        const reviewCollection = client.db('KachaBazaar-reviewDB').collection('reviews');
        const cartCollection = client.db("kachaBazaarDB-cartDB").collection("carts");

        //cart related api
        app.get("/cart", async (req, res) => {
            try {
                const email = req.query.email?.trim().toLowerCase();
                const items = await cartCollection.find({ email }).toArray();
                res.send(items);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch cart", details: err.message });
            }
        });

        app.post("/cart", async (req, res) => {
            try {
                const item = req.body;
                item.email = item.email?.trim().toLowerCase();
                item.date = new Date();
                item.quantity = item.quantity || 1;
                const result = await cartCollection.insertOne(item);
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to add to cart", details: err.message });
            }
        });

        app.delete("/cart/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const result = await cartCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to delete cart item", details: err.message });
            }
        });

        app.patch("/cart/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const { quantity } = req.body;
                const result = await cartCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { quantity } }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to update cart item", details: err.message });
            }
        });



        // review related api
        // POST: Add review
        app.post('/reviews', async (req, res) => {
            try {
                const review = req.body;
                review.date = new Date(); // Add timestamp
                const result = await reviewCollection.insertOne(review);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to submit review', error: error.message });
            }
        });

        // GET: All reviews for a specific product
        app.get('/reviews', async (req, res) => {
            const { productId } = req.query;
            if (!productId) {
                return res.status(400).send({ message: 'productId query is required' });
            }

            try {
                const reviews = await reviewCollection
                    .find({ productId })
                    .sort({ date: -1 })
                    .toArray();
                res.send(reviews);
            } catch (error) {
                res.status(500).send({ message: 'Failed to fetch reviews', error: error.message });
            }
        });


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
        // app.get("/advertisements", async (req, res) => {
        //     const result = await advertisementCollection.find().toArray();
        //     res.send(result);
        // });

        // PATCH ad status (approve/update)
        app.patch("/advertisements/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const update = req.body;

                const result = await advertisementCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: update }
                );

                res.send(result);
            } catch (error) {
                console.error("PATCH /advertisements/:id error:", error);
                res.status(500).send({ error: "Failed to update advertisement", details: error.message });
            }
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

        // ✅ GET /approved-products?sort=asc&startDate=2024-07-01&endDate=2024-07-15
        app.get('/approved-products', async (req, res) => {
            try {
                const { sort, startDate, endDate, search } = req.query;
                const filter = { status: 'approved' };

                // Search filter (case-insensitive regex on itemName)
                if (search) {
                    filter.itemName = { $regex: new RegExp(search, 'i') };
                }

                // Date filter
                if (startDate || endDate) {
                    filter.date = {};
                    if (startDate) filter.date.$gte = new Date(startDate);
                    if (endDate) filter.date.$lte = new Date(endDate);
                }

                const sortOrder = sort === 'asc' ? 1 : sort === 'desc' ? -1 : 0;

                const products = await productCollection
                    .find(filter)
                    .sort(sortOrder ? { pricePerUnit: sortOrder } : {})
                    .toArray();

                res.send(products);
            } catch (err) {
                res.status(500).send({ error: 'Failed to fetch products', details: err.message });
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

        // Update product fields
        app.patch('/products/:id', async (req, res) => {
            const id = req.params.id;
            const update = req.body;

            try {
                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: update }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: 'Update failed', details: err.message });
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

        app.get("/users/search", async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).send({ message: "Email query missing" });
            try {
                // Assuming MongoDB + case-insensitive regex search on email
                const regex = new RegExp(email, "i");
                const users = await userCollection.find({ email: { $regex: regex } }).toArray();
                res.send(users);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error" });
            }
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
