const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const bodyParser = require('body-parser');
// Security packages
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');
const xss = require('xss');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for proper IP handling behind Nginx (must be set before any middleware)
app.set('trust proxy', true);

// Debug: Log trust proxy setting
console.log('Trust proxy setting:', app.get('trust proxy'));

// Production optimizations
if (process.env.NODE_ENV === 'production') {
    // Disable x-powered-by header for security
    app.disable('x-powered-by');
    
    // Enable compression for better performance
    const compression = require('compression');
    app.use(compression());
}

// Logging setup
const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV !== 'production';

// Simple logging function
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data })
    };
    
    if (isDevelopment) {
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');
    } else {
        // In production, you might want to send logs to a service
        console.log(JSON.stringify(logEntry));
    }
}

// Database configuration
const databaseType = process.env.DATABASE_TYPE || 'sqlite';

// Database setup - now using DatabaseManager
const DatabaseManager = require('./src/services/database');
const db = new DatabaseManager();

// Stripe setup
const StripeService = require('./src/services/stripe');
const stripeService = new StripeService();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "https://*.supabase.co", "https://api.stripe.com"]
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
    keyGenerator: (req) => {
        // Use the real IP from the request, which should work with trust proxy
        return req.ip || req.connection.remoteAddress || 'unknown';
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 login attempts per windowMs
    message: 'Too many login attempts, please try again later.',
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        // Use the real IP from the request, which should work with trust proxy
        return req.ip || req.connection.remoteAddress || 'unknown';
    }
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 uploads per minute
    message: 'Too many uploads, please try again later.',
    keyGenerator: (req) => {
        // Use the real IP from the request, which should work with trust proxy
        return req.ip || req.connection.remoteAddress || 'unknown';
    }
});

// Slow down middleware
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // allow 50 requests per 15 minutes, then...
    delayMs: 500 // begin adding 500ms of delay per request above 50
});

// Debug middleware to log IP addresses
app.use((req, res, next) => {
    console.log('Request IP:', req.ip, 'X-Forwarded-For:', req.get('X-Forwarded-For'), 'Remote Address:', req.connection.remoteAddress);
    next();
});

// Test route to check static file serving
app.get('/test-static', (req, res) => {
    res.json({
        message: 'Static file test',
        assetsPath: '/assets',
        cssPath: '/assets/css/styles.css',
        jsPath: '/assets/scripts/script.js',
        faviconPath: '/assets/favicon.svg'
    });
});

app.use(limiter);
app.use(speedLimiter);

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static assets from assets folder with caching
app.use('/assets', express.static('assets', {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0', // Cache for 1 year in production
    etag: true,
    lastModified: true
}));

// Serve favicon from root
app.use('/favicon.svg', express.static('assets/favicon.svg', {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0'
}));

// Only serve local uploads if using SQLite
if (databaseType === 'sqlite') {
    app.use('/uploads', express.static('uploads', {
        maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0'
    }));
}


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
app.set('views', path.join(__dirname, 'src/views'));

// Helper function to get image URL
function getImageUrl(bucket, filename) {
    if (databaseType === 'supabase') {
        return `https://${process.env.SUPABASE_URL.split('//')[1]}/storage/v1/object/public/${bucket}/${filename}`;
    } else {
        // Check if file exists in assets/images first, otherwise use uploads
        const assetsPath = path.join(__dirname, 'assets/images', bucket, filename);
        if (fs.existsSync(assetsPath)) {
            return `/assets/images/${bucket}/${filename}`;
        }
        return `/uploads/${bucket}/${filename}`;
    }
}

// Make helper available to all views
app.locals.getImageUrl = getImageUrl;

// File upload configuration
let storage;
if (databaseType === 'supabase') {
    // For Supabase, store files in memory and upload to Supabase Storage
    storage = multer.memoryStorage();
} else {
    // For SQLite, store files locally
    storage = multer.diskStorage({
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
}

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
app.post('/admin/login', loginLimiter, sanitizeInput, async (req, res) => {
    try {
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
            log('info', 'Admin login successful', { username, ip: req.ip });
            res.redirect('/admin/dashboard');
        } else {
            log('warn', 'Admin login failed', { username, ip: req.ip });
            res.render('admin/login', { error: 'Felaktigt användarnamn eller lösenord' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('admin/login', { error: 'Ett fel uppstod vid inloggning' });
    }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
    log('info', 'Admin logout', { ip: req.ip });
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

app.post('/admin/blog', requireAuth, sanitizeInput, async (req, res) => {
    try {
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

app.post('/admin/books', requireAuth, uploadLimiter, upload.single('cover_image'), sanitizeInput, async (req, res) => {
    try {
        const { title, subtitle, description, status, release_date, price, sort_order } = req.body;
        let coverImage = null;
        
        if (req.file) {
            if (databaseType === 'supabase') {
                try {
                    // Upload to Supabase Storage
                    const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
                    const bucketName = process.env.SUPABASE_STORAGE_BUCKET_BOOKS || 'books';
                    console.log('Uploading file to Supabase:', { fileName, bucketName, mimetype: req.file.mimetype });
                    const uploadResult = await db.uploadFile(req.file, bucketName, fileName);
                    console.log('Upload result:', uploadResult);
                    coverImage = db.getFileUrl(bucketName, fileName);
                    console.log('Generated cover image URL:', coverImage);
                } catch (uploadError) {
                    console.error('Supabase upload error:', uploadError);
                    throw new Error(`File upload failed: ${uploadError.message}`);
                }
            } else {
                // Local storage
                coverImage = `/uploads/books/${req.file.filename}`;
            }
        }
        
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

app.post('/admin/books/:id', requireAuth, uploadLimiter, upload.single('cover_image'), sanitizeInput, async (req, res) => {
    try {
        const { title, subtitle, description, status, release_date, price, sort_order } = req.body;
        let coverImage = req.body.existing_cover_image;
        
        if (req.file) {
            if (databaseType === 'supabase') {
                try {
                    // Upload to Supabase Storage
                    const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
                    const bucketName = process.env.SUPABASE_STORAGE_BUCKET_BOOKS || 'books';
                    console.log('Uploading file to Supabase:', { fileName, bucketName, mimetype: req.file.mimetype });
                    const uploadResult = await db.uploadFile(req.file, bucketName, fileName);
                    console.log('Upload result:', uploadResult);
                    coverImage = db.getFileUrl(bucketName, fileName);
                    console.log('Generated cover image URL:', coverImage);
                } catch (uploadError) {
                    console.error('Supabase upload error:', uploadError);
                    throw new Error(`File upload failed: ${uploadError.message}`);
                }
            } else {
                // Local storage
                coverImage = `/uploads/books/${req.file.filename}`;
            }
        }
        
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

// Book blurbs management
app.get('/admin/books/:id/blurbs', requireAuth, async (req, res) => {
    try {
        const book = await db.getBook(req.params.id);
        const blurbs = await db.getBookBlurbs(req.params.id);
        res.render('admin/book-blurbs', { book, blurbs });
    } catch (error) {
        console.error('Error fetching book blurbs:', error);
        res.status(500).send('Server error');
    }
});

app.get('/admin/books/:id/blurbs/new', requireAuth, async (req, res) => {
    try {
        const book = await db.getBook(req.params.id);
        res.render('admin/blurb-form', { book, blurb: null });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.post('/admin/books/:id/blurbs', requireAuth, async (req, res) => {
    try {
        const blurbData = {
            book_id: req.params.id,
            name: req.body.name,
            quotation: req.body.quotation,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        await db.createBlurb(blurbData);
        res.redirect(`/admin/books/${req.params.id}/blurbs`);
    } catch (error) {
        console.error('Error creating blurb:', error);
        res.status(500).send('Server error');
    }
});

app.get('/admin/blurbs/:id/edit', requireAuth, async (req, res) => {
    try {
        const blurb = await db.getBlurb(req.params.id);
        const book = await db.getBook(blurb.book_id);
        res.render('admin/blurb-form', { book, blurb });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.post('/admin/blurbs/:id', requireAuth, async (req, res) => {
    try {
        const blurbData = {
            name: req.body.name,
            quotation: req.body.quotation,
            updated_at: new Date().toISOString()
        };
        
        await db.updateBlurb(req.params.id, blurbData);
        const blurb = await db.getBlurb(req.params.id);
        res.redirect(`/admin/books/${blurb.book_id}/blurbs`);
    } catch (error) {
        console.error('Error updating blurb:', error);
        res.status(500).send('Server error');
    }
});

app.post('/admin/blurbs/:id/delete', requireAuth, async (req, res) => {
    try {
        const blurb = await db.getBlurb(req.params.id);
        await db.deleteBlurb(req.params.id);
        res.redirect(`/admin/books/${blurb.book_id}/blurbs`);
    } catch (error) {
        console.error('Error deleting blurb:', error);
        res.status(500).send('Server error');
    }
});

// Orders management
app.get('/admin/orders', requireAuth, async (req, res) => {
    try {
        const orders = await db.getAllOrders();
        res.render('admin/orders', { orders });
    } catch (error) {
        console.error('Error fetching orders:', error);
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
        
        // Get blurbs for this book
        const blurbs = await db.getBookBlurbs(req.params.id);
        
        res.render('book', { book, blurbs });
    } catch (error) {
        console.error('Error fetching book details:', error);
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

// Purchase flow with Stripe integration
app.get('/purchase/:id', async (req, res) => {
    try {
        const book = await db.getBook(req.params.id);
        if (!book) {
            return res.status(404).send('Book not found');
        }
        if (!book.price || book.price <= 0) {
            return res.status(400).send('This book is not available for purchase');
        }
        
        const stripePublishableKey = stripeService.getPublishableKey();
        const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
        res.render('purchase', { book, stripePublishableKey, stripeConfigured });
    } catch (error) {
        console.error('Error fetching book for purchase:', error);
        res.status(500).send('Server error');
    }
});

// Create payment intent
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { bookId, customerInfo } = req.body;
        
        // Validate required fields
        if (!bookId || !customerInfo || !customerInfo.name || !customerInfo.email || !customerInfo.deliveryAddress) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const book = await db.getBook(bookId);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        if (!book.price || book.price <= 0) {
            return res.status(400).json({ error: 'Book not available for purchase' });
        }
        
        // Create payment intent
        const paymentIntent = await stripeService.createPaymentIntent(book, customerInfo);
        
        // Create order record
        const orderData = {
            book_id: bookId,
            stripe_payment_intent_id: paymentIntent.paymentIntentId,
            customer_name: customerInfo.name,
            customer_email: customerInfo.email,
            customer_phone: customerInfo.phone || null,
            delivery_address: customerInfo.deliveryAddress,
            amount: book.price,
            currency: 'SEK',
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        await db.createOrder(orderData);
        
        res.json({
            clientSecret: paymentIntent.clientSecret,
            paymentIntentId: paymentIntent.paymentIntentId
        });
    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ error: 'Failed to create payment intent' });
    }
});

// Payment success page
app.get('/payment/success', async (req, res) => {
    try {
        const { payment_intent } = req.query;
        
        if (!payment_intent) {
            return res.status(400).send('Payment intent ID required');
        }
        
        const order = await db.getOrderByPaymentIntentId(payment_intent);
        if (!order) {
            return res.status(404).send('Order not found');
        }
        
        const book = await db.getBook(order.book_id);
        
        res.render('payment-success', { order, book });
    } catch (error) {
        console.error('Error loading payment success page:', error);
        res.status(500).send('Server error');
    }
});

// Payment failure page
app.get('/payment/failure', (req, res) => {
    res.render('payment-failure');
});

// Stripe webhook handler
app.post('/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    try {
        const event = stripeService.verifyWebhookSignature(req.body, sig);
        
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                await db.updateOrderStatus(paymentIntent.id, 'completed');
                console.log('Payment succeeded:', paymentIntent.id);
                break;
                
            case 'payment_intent.payment_failed':
                const failedPayment = event.data.object;
                await db.updateOrderStatus(failedPayment.id, 'failed');
                console.log('Payment failed:', failedPayment.id);
                break;
                
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
        
        res.json({received: true});
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
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

















// Error handling middleware
app.use((err, req, res, next) => {
    log('error', 'Unhandled error occurred', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });
    
    if (isDevelopment) {
        res.status(500).send(`
            <h1>Server Error</h1>
            <p><strong>Error:</strong> ${err.message}</p>
            <pre>${err.stack}</pre>
        `);
    } else {
        res.status(500).send(`
            <h1>Something went wrong</h1>
            <p>We're sorry, but something went wrong. Please try again later.</p>
        `);
    }
});

// 404 handler
app.use((req, res) => {
    log('warn', '404 Not Found', { url: req.url, method: req.method, ip: req.ip });
    res.status(404).send(`
        <h1>Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/">Go back to homepage</a>
    `);
});

// Create upload directories
fs.ensureDirSync(path.join(__dirname, 'uploads', 'books'));
fs.ensureDirSync(path.join(__dirname, 'uploads', 'profile'));

// Start server
app.listen(PORT, () => {
    log('info', 'Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        database: databaseType
    });
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin/login`);
    console.log(`Public site: http://localhost:${PORT}`);
});
