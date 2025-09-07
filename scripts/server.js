const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ecommerce_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

// Initialize database
async function initDatabase() {
    try {
        // Create connection
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        // Create database
        await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        await connection.end();

        // Create pool
        pool = mysql.createPool(dbConfig);

        // Create tables
        const db = await mysql.createConnection(dbConfig);
        
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                phone VARCHAR(20) NULL,
                password VARCHAR(255) NOT NULL,
                avatar VARCHAR(255) NULL,
                is_active BOOLEAN DEFAULT TRUE,
                reset_token VARCHAR(255) NULL,
                reset_token_expires DATETIME NULL,
                last_login DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL,
                old_price DECIMAL(10,2) NULL,
                image VARCHAR(255),
                category VARCHAR(100),
                stock INT DEFAULT 0,
                rating DECIMAL(3,2) DEFAULT 0,
                review_count INT DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.end();

        console.log('✅ Database initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Database initialization error:', error.message);
        return false;
    }
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Routes

// Test endpoint
app.get('/api/test', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT 1 + 1 AS solution');
        res.json({ 
            success: true, 
            message: 'API is working!', 
            solution: rows[0].solution 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Database connection failed' 
        });
    }
});

// Register endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Nome, e-mail e senha são obrigatórios'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha deve ter pelo menos 6 caracteres'
            });
        }

        // Check if user exists
        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'E-mail já cadastrado'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Insert user
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
            [name, email, phone || null, hashedPassword]
        );

        // Generate token
        const token = jwt.sign(
            { id: result.insertId, email, name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Get created user
        const [newUser] = await pool.execute(
            'SELECT id, name, email, phone, created_at FROM users WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Usuário criado com sucesso',
            token,
            user: newUser[0]
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'E-mail e senha são obrigatórios'
            });
        }

        // Get user
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'E-mail ou senha incorretos'
            });
        }

        const user = users[0];

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'E-mail ou senha incorretos'
            });
        }

        // Check if user is active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Conta desativada. Entre em contato com o suporte.'
            });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Update last login
        await pool.execute(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );

        // Return user data (without password)
        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            avatar: user.avatar,
            created_at: user.created_at
        };

        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            token,
            user: userData
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Get user profile
app.get('/api/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token de acesso necessário'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user
        const [users] = await pool.execute(
            'SELECT id, name, email, phone, avatar, created_at FROM users WHERE id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            user: users[0]
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(401).json({
            success: false,
            message: 'Token inválido ou expirado'
        });
    }
});

// Serve static pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Start server
async function startServer() {
    const dbSuccess = await initDatabase();
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🏠 Home: http://localhost:${PORT}`);
        console.log(`🔐 Login: http://localhost:${PORT}/login`);
        console.log(`📝 Register: http://localhost:${PORT}/register`);
        
        if (!dbSuccess) {
            console.log('⚠️  Running in demo mode (no database)');
        }
    });
}

startServer().catch(console.error);