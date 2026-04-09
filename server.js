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

// Trust exactly one proxy hop (the hosting platform's reverse proxy / Nginx).
// Using `true` would trust any X-Forwarded-For header and let clients spoof IPs.
app.set('trust proxy', 1);

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

// Database configuration (Supabase only; see src/services/database.js)
const databaseType = process.env.DATABASE_TYPE || 'supabase';

// Database setup - now using DatabaseManager
const DatabaseManager = require('./src/services/database');
const db = new DatabaseManager();

// Stripe setup
const StripeService = require('./src/services/stripe');
const stripeService = new StripeService();

// Resend email service setup
const ResendService = require('./src/services/resend');
const resendService = new ResendService();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
            frameSrc: ["'self'", "https://js.stripe.com"],
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

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static assets from assets folder with caching
// Registered BEFORE rate limiters so static files are never throttled or counted
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0',
    etag: true,
    lastModified: true
}));

// Serve favicon from root
app.use('/favicon.svg', express.static(path.join(__dirname, 'assets')));

// Local upload fallbacks (when not using Supabase public URLs)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0',
    etag: true,
    lastModified: true
}));

// Rate limiting applied only to dynamic routes (after static assets)
app.use(limiter);
app.use(speedLimiter);

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

// Helper function to get image URL (Supabase Storage; assets fallback for bundled images)
function getImageUrl(bucket, filename) {
    if (process.env.SUPABASE_URL) {
        const host = process.env.SUPABASE_URL.replace(/^https?:\/\//, '');
        return `https://${host}/storage/v1/object/public/${bucket}/${filename}`;
    }
    const assetsPath = path.join(__dirname, 'assets/images', bucket, filename);
    if (fs.existsSync(assetsPath)) {
        return `/assets/images/${bucket}/${filename}`;
    }
    return `/uploads/${bucket}/${filename}`;
}

// Public site URL for canonical / Open Graph (override in production if needed)
const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://mikaeldolfe.se').replace(/\/$/, '');
function absoluteUrl(urlOrPath) {
    if (urlOrPath == null || urlOrPath === '') {
        return `${siteUrl}/assets/favicon.svg`;
    }
    const s = String(urlOrPath);
    if (/^https?:\/\//i.test(s)) {
        return s;
    }
    const pathPart = s.startsWith('/') ? s : `/${s}`;
    return `${siteUrl}${pathPart}`;
}

// Make helper available to all views
app.locals.getImageUrl = getImageUrl;
app.locals.siteUrl = siteUrl;
app.locals.absoluteUrl = absoluteUrl;

// File upload configuration — memory buffer, then Supabase Storage
const storage = multer.memoryStorage();

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
            try {
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
            try {
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
        
        // Fetch book information for each order
        const ordersWithBooks = await Promise.all(orders.map(async (order) => {
            try {
                const book = await db.getBook(order.book_id);
                return {
                    ...order,
                    book_title: book ? book.title : 'Bok borttagen'
                };
            } catch (error) {
                console.error(`Error fetching book ${order.book_id}:`, error);
                return {
                    ...order,
                    book_title: 'Bok borttagen'
                };
            }
        }));
        
        res.render('admin/orders', { orders: ordersWithBooks });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).send('Server error');
    }
});



// Serve the main website
app.get('/', async (req, res) => {
    try {
        const allBlurbs = await db.getAllBookBlurbs();
        const blurbs = allBlurbs.slice(0, 3);
        res.render('index', { blurbs });
    } catch (error) {
        log('warn', 'Could not load blurbs for homepage', { error: error.message });
        res.render('index', { blurbs: [] });
    }
});

app.get('/blogg', async (req, res) => {
    try {
        const posts = await db.getAllBlogPosts();
        res.render('blogg', { posts });
    } catch (error) {
        console.error('Error fetching blog posts:', error);
        res.status(500).send('Server error');
    }
});

app.get('/integritet', (req, res) => {
    res.render('integritet');
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

// Contact form endpoint
app.post('/api/contact', sanitizeInput, async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        
        // Validate required fields
        if (!name || !email || !message) {
            return res.status(400).json({ 
                error: 'Namn, e-post och meddelande är obligatoriska fält.' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'Ogiltig e-postadress.' 
            });
        }

        // Check if Resend is configured
        if (!resendService.isServiceConfigured()) {
            console.log('⚠️ Resend not configured, contact form submission logged only');
            log('info', 'Contact form submission (email not sent)', {
                name,
                email,
                subject,
                message: message.substring(0, 100) + '...',
                ip: req.ip
            });
            
            return res.status(200).json({ 
                success: true, 
                message: 'Meddelandet har mottagits. Tack för ditt intresse!' 
            });
        }

        // Send email to admin
        await resendService.sendContactEmail({ name, email, subject, message });
        
        // Send confirmation email to user
        await resendService.sendConfirmationEmail({ name, email });
        
        log('info', 'Contact form submitted successfully', {
            name,
            email,
            subject,
            ip: req.ip
        });

        res.json({ 
            success: true, 
            message: 'Tack för ditt meddelande! Du kommer att få en bekräftelse via e-post.' 
        });
        
    } catch (error) {
        console.error('❌ Contact form error:', error);
        log('error', 'Contact form submission failed', {
            error: error.message,
            ip: req.ip
        });
        
        res.status(500).json({ 
            error: 'Ett fel uppstod vid skickande av meddelandet. Försök igen senare.' 
        });
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
        console.log('🔄 Creating payment intent...');
        const { bookId, customerInfo } = req.body;
        console.log('📝 Request data:', { bookId, customerInfo });
        
        // Validate required fields
        if (!bookId || !customerInfo || !customerInfo.name || !customerInfo.email || !customerInfo.deliveryAddress) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customerInfo.email)) {
            console.log('❌ Invalid email format:', customerInfo.email);
            return res.status(400).json({ error: 'Invalid email address format' });
        }
        
        const book = await db.getBook(bookId);
        if (!book) {
            console.log('❌ Book not found');
            return res.status(404).json({ error: 'Book not found' });
        }
        
        if (!book.price || book.price <= 0) {
            console.log('❌ Book not available for purchase');
            return res.status(400).json({ error: 'Book not available for purchase' });
        }
        
        console.log('📚 Book found:', { id: book.id, title: book.title, price: book.price });
        
        // Check if Stripe is configured
        if (!stripeService.stripe) {
            console.log('❌ Stripe not configured');
            return res.status(500).json({ error: 'Stripe is not configured. Please check your environment variables.' });
        }
        
        // Create payment intent
        console.log('💳 Creating payment intent with Stripe...');
        const paymentIntent = await stripeService.createPaymentIntent(book, customerInfo);
        console.log('✅ Payment intent created:', paymentIntent.paymentIntentId);
        
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
        
        console.log('💾 Creating order record...');
        await db.createOrder(orderData);
        console.log('✅ Order record created');
        
        res.json({
            clientSecret: paymentIntent.clientSecret,
            paymentIntentId: paymentIntent.paymentIntentId
        });
    } catch (error) {
        console.error('❌ Error creating payment intent:', error);
        res.status(500).json({ error: `Failed to create payment intent: ${error.message}` });
    }
});

// Payment success page
app.get('/payment/success', async (req, res) => {
    try {
        const { payment_intent } = req.query;
        
        if (!payment_intent) {
            console.log('❌ No payment intent ID provided');
            return res.status(400).send('Payment intent ID required');
        }
        
        console.log('🔍 Verifying payment intent:', payment_intent);
        
        // Get order from database
        const order = await db.getOrderByPaymentIntentId(payment_intent);
        if (!order) {
            console.log('❌ Order not found for payment intent:', payment_intent);
            return res.status(404).send('Order not found');
        }
        
        console.log('📦 Order found:', { id: order.id, status: order.status });
        
        // Verify payment status with Stripe
        if (stripeService.stripe) {
            try {
                const stripePaymentIntent = await stripeService.retrievePaymentIntent(payment_intent);
                console.log('💳 Stripe payment status:', stripePaymentIntent.status);
                
                // Only show success if payment is actually successful
                if (stripePaymentIntent.status !== 'succeeded') {
                    console.log('❌ Payment not successful, status:', stripePaymentIntent.status);
                    return res.redirect('/payment/failure?reason=payment_not_completed');
                }
                
                // Update order status if it's still pending
                if (order.status === 'pending') {
                    await db.updateOrderStatus(payment_intent, 'completed');
                    console.log('✅ Order status updated to completed');
                }
            } catch (stripeError) {
                console.error('❌ Error verifying payment with Stripe:', stripeError);
                return res.redirect('/payment/failure?reason=verification_failed');
            }
        } else {
            console.log('⚠️ Stripe not configured, skipping verification');
        }
        
        const book = await db.getBook(order.book_id);
        
        res.render('payment-success', { order, book });
    } catch (error) {
        console.error('❌ Error loading payment success page:', error);
        res.status(500).send('Server error');
    }
});

// Payment failure page
app.get('/payment/failure', (req, res) => {
    const { reason } = req.query;
    let errorMessage = 'Betalningen misslyckades.';
    
    switch (reason) {
        case 'payment_not_completed':
            errorMessage = 'Betalningen avbröts eller slutfördes inte.';
            break;
        case 'verification_failed':
            errorMessage = 'Kunde inte verifiera betalningen. Kontakta support.';
            break;
        default:
            errorMessage = 'Betalningen misslyckades.';
    }
    
    res.render('payment-failure', { errorMessage });
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
