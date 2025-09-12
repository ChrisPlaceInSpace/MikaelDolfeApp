const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');
const xss = require('xss');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup - now using DatabaseManager
const DatabaseManager = require('./services/database');
const db = new DatabaseManager();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 login attempts per windowMs
    message: 'Too many login attempts, please try again later.',
    skipSuccessfulRequests: true,
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 uploads per minute
    message: 'Too many uploads, please try again later.',
});

// Slow down middleware
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // allow 50 requests per 15 minutes, then...
    delayMs: 500 // begin adding 500ms of delay per request above 50
});

app.use(limiter);
app.use(speedLimiter);

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Serve static files from root directory
app.use('/styles.css', express.static(path.join(__dirname, 'styles.css')));
app.use('/script.js', express.static(path.join(__dirname, 'script.js')));
app.use('/favicon.svg', express.static(path.join(__dirname, 'favicon.svg')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-for-development',
    resave: false,
    saveUninitialized: false,
    name: 'mikael-dolfe-session', // Custom session name
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true, // Prevent XSS attacks
        maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict' // CSRF protection
    },
    rolling: true // Reset expiration on activity
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// File upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadDir;
        // Map field names to proper directory names
        if (file.fieldname === 'cover_image') {
            uploadDir = path.join(__dirname, 'uploads', 'books');
        } else {
            uploadDir = path.join(__dirname, 'uploads', file.fieldname);
        }
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = new RegExp(process.env.ALLOWED_FILE_TYPES || 'jpeg|jpg|png|gif|webp');
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.authenticated) {
        // Check session timeout (optional additional security)
        const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
        if (req.session.loginTime && (Date.now() - req.session.loginTime) > sessionTimeout) {
            req.session.destroy();
            return res.redirect('/admin/login');
        }
        next();
    } else {
        res.redirect('/admin/login');
    }
}

// Input sanitization middleware
function sanitizeInput(req, res, next) {
    if (req.body) {
        for (let key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = xss(req.body[key]);
            }
        }
    }
    next();
}

// Routes

// Admin login page
app.get('/admin/login', (req, res) => {
    res.render('admin/login');
});

// Admin login POST
app.post('/admin/login', loginLimiter, [
    body('username').trim().isLength({ min: 1 }).escape(),
    body('password').isLength({ min: 1 })
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('admin/login', { error: 'Invalid input' });
        }

        const { username, password } = req.body;
        
        // Admin credentials from environment variables
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        
        // If no hashed password is set, use plain text (for initial setup)
        let isValidPassword = false;
        if (adminPasswordHash) {
            isValidPassword = await bcrypt.compare(password, adminPasswordHash);
        } else {
            const plainPassword = process.env.ADMIN_PASSWORD || 'default-password';
            isValidPassword = password === plainPassword;
        }
        
        if (username === adminUsername && isValidPassword) {
            req.session.authenticated = true;
            req.session.loginTime = Date.now();
            res.redirect('/admin/dashboard');
        } else {
            res.render('admin/login', { error: 'Felaktigt användarnamn eller lösenord' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('admin/login', { error: 'Ett fel uppstod vid inloggning' });
    }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// Admin dashboard
app.get('/admin/dashboard', requireAuth, async (req, res) => {
    try {
        // Get counts for dashboard
        const blogCount = await getCount('blog_posts');
        const booksCount = await getCount('books');
        
        res.render('admin/dashboard', {
            blogCount,
            booksCount
        });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Blog posts management
app.get('/admin/blog', requireAuth, async (req, res) => {
    try {
        const posts = await db.getAllBlogPostsAdmin();
        res.render('admin/blog', { posts });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.get('/admin/blog/new', requireAuth, (req, res) => {
    res.render('admin/blog-form', { post: null });
});

app.post('/admin/blog', requireAuth, sanitizeInput, [
    body('title').trim().isLength({ min: 1, max: 200 }).escape(),
    body('content').trim().isLength({ min: 1 }).escape(),
    body('excerpt').optional().trim().isLength({ max: 500 }).escape(),
    body('status').isIn(['draft', 'published'])
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).send('Invalid input data');
        }

        const { title, content, excerpt, status } = req.body;
        const post = {
            title,
            content,
            excerpt,
            status: status || 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        await db.createBlogPost(post);
        res.redirect('/admin/blog');
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.get('/admin/blog/:id/edit', requireAuth, async (req, res) => {
    try {
        const post = await db.getBlogPost(req.params.id);
        res.render('admin/blog-form', { post });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.post('/admin/blog/:id', requireAuth, async (req, res) => {
    try {
        const { title, content, excerpt, status } = req.body;
        const post = {
            id: req.params.id,
            title,
            content,
            excerpt,
            status,
            updated_at: new Date().toISOString()
        };
        
        await db.updateBlogPost(post.id, post);
        res.redirect('/admin/blog');
    } catch (error) {
        console.error('Blog post update error:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.post('/admin/blog/:id/delete', requireAuth, async (req, res) => {
    try {
        await db.deleteBlogPost(req.params.id);
        res.redirect('/admin/blog');
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Books management
app.get('/admin/books', requireAuth, async (req, res) => {
    try {
        const books = await db.getAllBooksAdmin();
        res.render('admin/books', { books });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.get('/admin/books/new', requireAuth, (req, res) => {
    res.render('admin/book-form', { book: null });
});

app.post('/admin/books', requireAuth, uploadLimiter, sanitizeInput, upload.single('cover_image'), [
    body('title').trim().isLength({ min: 1, max: 200 }).escape(),
    body('subtitle').optional().trim().isLength({ max: 200 }).escape(),
    body('description').optional().trim().isLength({ max: 1000 }).escape(),
    body('price').optional().isFloat({ min: 0 }),
    body('status').isIn(['draft', 'published', 'coming_soon']),
    body('sort_order').optional().isInt({ min: 0 })
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).send('Invalid input data');
        }

        const { title, subtitle, description, status, release_date, price, sort_order } = req.body;
        const coverImage = req.file ? `/uploads/books/${req.file.filename}` : null;
        
        const book = {
            title,
            subtitle: subtitle || null,
            description: description || null,
            cover_image: coverImage,
            price: price ? parseFloat(price) : null,
            status: status || 'draft',
            release_date: release_date || null,
            sort_order: sort_order ? parseInt(sort_order) : 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        await db.createBook(book);
        res.redirect('/admin/books');
    } catch (error) {
        console.error('Book creation error:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.get('/admin/books/:id/edit', requireAuth, async (req, res) => {
    try {
        const book = await db.getBook(req.params.id);
        res.render('admin/book-form', { book });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.post('/admin/books/:id', requireAuth, upload.single('cover_image'), async (req, res) => {
    try {
        const { title, subtitle, description, status, release_date, price, sort_order } = req.body;
        const coverImage = req.file ? `/uploads/books/${req.file.filename}` : req.body.existing_cover_image;
        
        const book = {
            id: req.params.id,
            title,
            subtitle: subtitle || null,
            description: description || null,
            cover_image: coverImage,
            price: price ? parseFloat(price) : null,
            status: status || 'draft',
            release_date: release_date || null,
            sort_order: sort_order ? parseInt(sort_order) : 0,
            updated_at: new Date().toISOString()
        };
        
        await db.updateBook(book.id, book);
        res.redirect('/admin/books');
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.post('/admin/books/:id/delete', requireAuth, async (req, res) => {
    try {
        await db.deleteBook(req.params.id);
        res.redirect('/admin/books');
    } catch (error) {
        res.status(500).send('Server error');
    }
});



// Serve the main website
app.get('/', (req, res) => {
    res.render('index');
});

// Public API endpoints for the frontend
app.get('/api/blog', async (req, res) => {
    try {
        const posts = await db.getAllBlogPosts();
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/books', async (req, res) => {
    try {
        const books = await db.getAllBooks();
        res.json(books);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});


// Individual content pages
app.get('/book/:id', async (req, res) => {
    try {
        const book = await db.getBook(req.params.id);
        if (!book) {
            return res.status(404).send('Bok hittades inte');
        }
        res.render('book', { book });
    } catch (error) {
        res.status(500).send('Server error');
    }
});


app.get('/blog/:id', async (req, res) => {
    try {
        const post = await db.getBlogPost(req.params.id);
        if (!post) {
            return res.status(404).send('Blogginlägg hittades inte');
        }
        res.render('blog-post', { post });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Purchase flow
app.get('/purchase/:id', async (req, res) => {
    try {
        const book = await db.getBook(req.params.id);
        if (!book) {
            return res.status(404).send('Book not found');
        }
        if (!book.price) {
            return res.status(400).send('This book is not available for purchase');
        }
        res.render('purchase', { book });
    } catch (error) {
        console.error('Error fetching book for purchase:', error);
        res.status(500).send('Server error');
    }
});

app.post('/purchase/:id/confirm', async (req, res) => {
    try {
        const { full_name, email, phone, address, terms } = req.body;
        
        // Validate required fields
        if (!full_name || !email || !phone || !address || !terms) {
            return res.status(400).send('All fields are required');
        }
        
        const book = await db.getBook(req.params.id);
        if (!book) {
            return res.status(404).send('Book not found');
        }
        
        // For now, just render confirmation page
        // Later this will send email and redirect to payment
        const purchase = {
            full_name,
            email,
            phone,
            address,
            book_id: book.id,
            price: book.price,
            timestamp: new Date().toISOString()
        };
        
        // TODO: Send email to Mikael Dolfe with purchase details
        // TODO: Integrate with payment processor (Stripe, etc.)
        
        res.render('purchase-confirmation', { book, purchase });
    } catch (error) {
        console.error('Error processing purchase:', error);
        res.status(500).send('Server error');
    }
});

// Database helper functions
async function getCount(table) {
    if (table === 'books') {
        const books = await db.getAllBooks();
        return books.length;
    } else if (table === 'blog_posts') {
        const posts = await db.getAllBlogPosts();
        return posts.length;
    }
    return 0;
}

















// Create upload directories
fs.ensureDirSync(path.join(__dirname, 'uploads', 'books'));
fs.ensureDirSync(path.join(__dirname, 'uploads', 'profile'));



// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin/login`);
    console.log(`Public site: http://localhost:${PORT}`);
});
