const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'neuratech_super_secret_jwt_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access denied. Token missing." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user;
    next();
  });
}

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "Provide username, email, and password." });

    const existingUser = await db.get("SELECT * FROM users WHERE email = ?", [email]);
    if (existingUser) return res.status(400).json({ error: "Email is already registered." });

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, hashedPassword]);
    res.status(201).json({ message: "Registration successful. You can log in now." });
  } catch (error) {
    res.status(500).json({ error: "Database error during registration." });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Provide email and password." });

    const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return res.status(400).json({ error: "Invalid email or password." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid email or password." });

    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ id: user.id, username: user.username, email: user.email, created_at: user.created_at });
  } catch (error) {
    res.status(500).json({ error: "Database error." });
  }
});

// GET PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    const { category, search } = req.query;
    let products = await db.all("SELECT * FROM products");

    if (category && category !== 'All') {
      products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }
    if (search) {
      const searchLower = search.toLowerCase();
      products = products.filter(p => p.name.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower));
    }
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Database error." });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.get("SELECT * FROM products WHERE id = ?", [req.params.id]);
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: "Database error." });
  }
});

// SUBMIT ORDER
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Cart is empty." });
    if (!shippingAddress || shippingAddress.trim() === "") return res.status(400).json({ error: "Shipping address required." });

    const orderItemsDetails = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = await db.get("SELECT * FROM products WHERE id = ?", [item.productId]);
      if (!product) return res.status(400).json({ error: `Product with ID ${item.productId} not found.` });
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for '${product.name}'.` });
      }
      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;
      orderItemsDetails.push({ productId: product.id, name: product.name, price: product.price, image: product.image, quantity: item.quantity, total: itemTotal });
    }

    for (const item of items) {
      const product = await db.get("SELECT * FROM products WHERE id = ?", [item.productId]);
      await db.run("UPDATE products SET stock = ? WHERE id = ?", [product.stock - item.quantity, product.id]);
    }

    const result = await db.run(
      "INSERT INTO orders (user_id, items, total_amount, shipping_address, status) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, JSON.stringify(orderItemsDetails), totalAmount, shippingAddress, 'Completed']
    );

    res.status(201).json({ message: "Order placed successfully.", orderId: result.lastID, totalAmount, items: orderItemsDetails });
  } catch (error) {
    res.status(500).json({ error: "Error processing order." });
  }
});

// ORDER HISTORY
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await db.all("SELECT * FROM orders WHERE user_id = ?", [req.user.id]);
    const formattedOrders = orders.map(order => ({ ...order, items: JSON.parse(order.items) }));
    res.json(formattedOrders);
  } catch (error) {
    res.status(500).json({ error: "Error retrieving orders." });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

db.initialize().then(() => {
  app.listen(PORT, () => console.log(`NeuraTech Server running on http://localhost:${PORT}`));
}).catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});