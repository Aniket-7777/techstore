const fs = require('fs');
const path = require('path');

// Target database file paths
const DB_FILE = path.join(__dirname, 'data.db');
const FALLBACK_DIR = path.join(__dirname, 'db_fallback');

// Seed data
const INITIAL_PRODUCTS = [
  {
    id: 1,
    name: "Nexus Glass (Neural AR Eyewear)",
    price: 899.00,
    image: "https://images.unsplash.com/photo-1591522810850-58128c5fb0a0?auto=format&fit=crop&w=600&q=80",
    category: "Wearables",
    rating: 4.8,
    stock: 15,
    description: "Sleek, lightweight augmented reality glasses with direct neural interface, real-time language translation, and high-fidelity overlay graphics. Experience a fully interactive workspace layered over your physical environment."
  },
  {
    id: 2,
    name: "Aura Band (Holographic Health Tracker)",
    price: 349.00,
    image: "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?auto=format&fit=crop&w=600&q=80",
    category: "Wearables",
    rating: 4.6,
    stock: 30,
    description: "A minimal wristband that projects a 3D holographic dashboard showing real-time biometric tracking, oxygen levels, circadian rhythm analysis, and advanced metabolic diagnostics."
  },
  {
    id: 3,
    name: "Omni Pod (Quantum Sound Capsule)",
    price: 249.00,
    image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80",
    category: "Audio",
    rating: 4.9,
    stock: 25,
    description: "Wireless earbuds using quantum resonance to deliver acoustic sound isolation, adaptive environmental noise cancellation, and a personalized 360-degree audio soundstage."
  },
  {
    id: 4,
    name: "Vortex Hub (Holographic Computer Platform)",
    price: 1499.00,
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80",
    category: "Computers",
    rating: 4.7,
    stock: 8,
    description: "A sleek desktop cylinder that projects a fully interactive, multi-window 3D holographic workspace. Work, browse, or watch media with gesture-controlled floating screens."
  },
  {
    id: 5,
    name: "Synapse Pro (Brain-Computer Interface)",
    price: 599.00,
    image: "https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=600&q=80",
    category: "Neural",
    rating: 4.5,
    stock: 12,
    description: "A lightweight, stylish headband that translates neural intent into device inputs. Control smart devices, applications, and play games using focused mental commands."
  },
  {
    id: 6,
    name: "Chronos Watch (Temporal Smartwatch)",
    price: 449.00,
    image: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=600&q=80",
    category: "Wearables",
    rating: 4.7,
    stock: 20,
    description: "A gorgeous smartwatch featuring atomic clock synchronization, solar-charging sapphire display, and an integrated AI assistant that schedules your day based on energy levels."
  }
];

class Database {
  constructor() {
    this.useFallback = false;
    this.sqliteDb = null;
    this.jsonStore = {
      users: [],
      products: [],
      orders: []
    };
  }

  async initialize() {
    try {
      const sqlite3 = require('sqlite3').verbose();
      return new Promise((resolve, reject) => {
        this.sqliteDb = new sqlite3.Database(DB_FILE, async (err) => {
          if (err) {
            console.warn("SQLite database connection failed. Falling back to JSON file storage...", err.message);
            this.setupJsonFallback();
            resolve();
          } else {
            console.log("SQLite connected successfully.");
            try {
              await this.createTables();
              await this.seedProducts();
              resolve();
            } catch (initErr) {
              reject(initErr);
            }
          }
        });
      });
    } catch (e) {
      console.warn("sqlite3 package not available or failed to compile. Falling back to JSON file storage.");
      this.setupJsonFallback();
    }
  }

  setupJsonFallback() {
    this.useFallback = true;
    if (!fs.existsSync(FALLBACK_DIR)) {
      fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    }

    const loadOrInitFile = (fileName, initialData) => {
      const filePath = path.join(FALLBACK_DIR, fileName);
      if (fs.existsSync(filePath)) {
        try {
          return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
          console.error(`Error reading ${fileName}, resetting.`, e);
          fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
          return initialData;
        }
      } else {
        fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
        return initialData;
      }
    };

    this.jsonStore.users = loadOrInitFile('users.json', []);
    this.jsonStore.products = loadOrInitFile('products.json', INITIAL_PRODUCTS);
    this.jsonStore.orders = loadOrInitFile('orders.json', []);
    console.log("JSON Fallback Database initialized successfully.");
  }

  saveFallbackFile(table) {
    const filePath = path.join(FALLBACK_DIR, `${table}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.jsonStore[table], null, 2));
  }

  createTables() {
    return new Promise((resolve, reject) => {
      const queries = [
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          price REAL NOT NULL,
          image TEXT,
          category TEXT,
          rating REAL,
          stock INTEGER,
          description TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          items TEXT NOT NULL,
          total_amount REAL NOT NULL,
          shipping_address TEXT NOT NULL,
          status TEXT DEFAULT 'Pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )`
      ];

      let completed = 0;
      queries.forEach(q => {
        this.sqliteDb.run(q, (err) => {
          if (err) return reject(err);
          completed++;
          if (completed === queries.length) resolve();
        });
      });
    });
  }

  async seedProducts() {
    const count = await this.get("SELECT COUNT(*) as count FROM products");
    if (count && count.count === 0) {
      console.log("Seeding products table with initial premium gadgets...");
      for (const p of INITIAL_PRODUCTS) {
        await this.run(
          `INSERT INTO products (id, name, price, image, category, rating, stock, description) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.name, p.price, p.image, p.category, p.rating, p.stock, p.description]
        );
      }
    }
  }

  run(sql, params = []) {
    if (this.useFallback) {
      return this.executeFallbackRun(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    if (this.useFallback) {
      return this.executeFallbackGet(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    if (this.useFallback) {
      return this.executeFallbackAll(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async executeFallbackRun(sql, params) {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (sql.startsWith("INSERT INTO users")) {
      const id = this.jsonStore.users.length > 0 ? Math.max(...this.jsonStore.users.map(u => u.id)) + 1 : 1;
      const [username, email, password] = params;
      if (this.jsonStore.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email");
      }
      this.jsonStore.users.push({ id, username, email, password, created_at: new Date().toISOString() });
      this.saveFallbackFile('users');
      return { lastID: id, changes: 1 };
    }
    if (sql.startsWith("INSERT INTO orders")) {
      const id = this.jsonStore.orders.length > 0 ? Math.max(...this.jsonStore.orders.map(o => o.id)) + 1 : 1;
      const [user_id, items, total_amount, shipping_address, status] = params;
      this.jsonStore.orders.push({ id, user_id, items, total_amount, shipping_address, status: status || 'Pending', created_at: new Date().toISOString() });
      this.saveFallbackFile('orders');
      return { lastID: id, changes: 1 };
    }
    if (sql.startsWith("UPDATE products SET stock = ? WHERE id = ?")) {
      const [stock, id] = params;
      const product = this.jsonStore.products.find(p => p.id === Number(id));
      if (product) {
        product.stock = Number(stock);
        this.saveFallbackFile('products');
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    if (sql.startsWith("INSERT INTO products")) {
      const [id, name, price, image, category, rating, stock, description] = params;
      this.jsonStore.products.push({ id, name, price, image, category, rating, stock, description });
      this.saveFallbackFile('products');
      return { lastID: id, changes: 1 };
    }
    throw new Error(`Unsupported fallback SQL command: ${sql}`);
  }

  async executeFallbackGet(sql, params) {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (sql.includes("SELECT COUNT(*) as count FROM products")) {
      return { count: this.jsonStore.products.length };
    }
    if (sql.includes("SELECT * FROM users WHERE email = ?")) {
      const email = params[0].toLowerCase();
      return this.jsonStore.users.find(u => u.email.toLowerCase() === email) || null;
    }
    if (sql.includes("SELECT * FROM users WHERE id = ?")) {
      const id = Number(params[0]);
      const user = this.jsonStore.users.find(u => u.id === id);
      return user ? { id: user.id, username: user.username, email: user.email, created_at: user.created_at } : null;
    }
    if (sql.includes("SELECT * FROM products WHERE id = ?")) {
      const id = Number(params[0]);
      return this.jsonStore.products.find(p => p.id === id) || null;
    }
    throw new Error(`Unsupported fallback SQL command: ${sql}`);
  }

  async executeFallbackAll(sql, params) {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (sql.includes("SELECT * FROM products")) {
      return this.jsonStore.products;
    }
    if (sql.includes("SELECT * FROM orders WHERE user_id = ?")) {
      const userId = Number(params[0]);
      const orders = this.jsonStore.orders.filter(o => o.user_id === userId);
      return orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    throw new Error(`Unsupported fallback SQL command: ${sql}`);
  }
}

module.exports = new Database();