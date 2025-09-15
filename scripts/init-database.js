const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

// Ensure database directory exists
const dbDir = path.join(__dirname, '..', 'database');
fs.ensureDirSync(dbDir);

const dbPath = path.join(dbDir, 'mikael-dolfe.db');
const db = new sqlite3.Database(dbPath);

console.log('Initializing database...');

// Create tables
db.serialize(() => {
    // Blog posts table
    db.run(`
        CREATE TABLE IF NOT EXISTS blog_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            excerpt TEXT,
            status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating blog_posts table:', err);
        } else {
            console.log('✓ blog_posts table created');
        }
    });

    // Books table
    db.run(`
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            subtitle TEXT,
            description TEXT,
            cover_image TEXT,
            price DECIMAL(10,2),
            status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'coming_soon')),
            release_date DATE,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating books table:', err);
        } else {
            console.log('✓ books table created');
        }
    });

    // Book blurbs table
    db.run(`
        CREATE TABLE IF NOT EXISTS book_blurbs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            quotation TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating book_blurbs table:', err);
        } else {
            console.log('✓ book_blurbs table created');
        }
    });

    // Add price and sort_order columns to existing books table if they don't exist
    db.run(`ALTER TABLE books ADD COLUMN IF NOT EXISTS price DECIMAL(10,2)`, (err) => {
        if (err) {
            console.error('Error adding price column:', err);
        } else {
            console.log('✓ Price column added/verified');
        }
    });

    db.run(`ALTER TABLE books ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`, (err) => {
        if (err) {
            console.error('Error adding sort_order column:', err);
        } else {
            console.log('✓ Sort order column added/verified');
        }
    });


    // Insert sample data
    db.run(`
        INSERT OR IGNORE INTO blog_posts (title, content, excerpt, status, created_at, updated_at) 
        VALUES (
            'Skrivandets process',
            'Reflektioner kring hur "Älska har sin tid" tog form och vad som inspirerade berättelsen om Nancy. Detta är en längre text som beskriver processen...',
            'Reflektioner kring hur "Älska har sin tid" tog form och vad som inspirerade berättelsen om Nancy...',
            'published',
            '2024-12-15 10:00:00',
            '2024-12-15 10:00:00'
        )
    `, (err) => {
        if (err) {
            console.error('Error inserting sample blog post:', err);
        } else {
            console.log('✓ Sample blog post inserted');
        }
    });

    db.run(`
        INSERT OR IGNORE INTO books (title, subtitle, description, status, release_date, created_at, updated_at) 
        VALUES (
            'Älska har sin tid',
            'Boken om Nancy',
            'En poetisk och filosofisk roman som utforskar kärlekens natur och tidens gång. Boken följer Nancy och hennes resa genom livets olika faser.',
            'coming_soon',
            '2025-01-15',
            '2024-12-15 10:00:00',
            '2024-12-15 10:00:00'
        )
    `, (err) => {
        if (err) {
            console.error('Error inserting sample book:', err);
        } else {
            console.log('✓ Sample book inserted');
        }
    });

    // Insert sample blurbs for the first book
    db.run(`
        INSERT OR IGNORE INTO book_blurbs (book_id, name, quotation, created_at, updated_at) 
        VALUES 
        (1, 'Anna Lindberg, Litteraturkritiker', 'En mästerlig berättelse som fångar läsaren från första sidan. Mikael Dolfe har skapat en roman som både rör och utmanar.', '2024-12-15 10:00:00', '2024-12-15 10:00:00'),
        (1, 'Erik Johansson, Författare', 'En gripande skildring av kärlek och förlust. Dolfe visar stor mognad i sitt skrivande och levererar en bok som kommer att stanna hos läsaren länge efter att sista sidan är läst.', '2024-12-15 10:00:00', '2024-12-15 10:00:00'),
        (1, 'Maria Svensson, Bokhandlare', 'Våra kunder älskar denna bok! Den har blivit en av våra bästsäljare och vi får ständigt positiva kommentarer från läsare som uppskattar både berättelsen och skrivstilen.', '2024-12-15 10:00:00', '2024-12-15 10:00:00')
    `, (err) => {
        if (err) {
            console.error('Error inserting sample blurbs:', err);
        } else {
            console.log('✓ Sample blurbs inserted');
        }
    });


    // Create indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status)`, (err) => {
        if (err) {
            console.error('Error creating blog posts index:', err);
        } else {
            console.log('✓ Blog posts index created');
        }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_books_status ON books(status)`, (err) => {
        if (err) {
            console.error('Error creating books index:', err);
        } else {
            console.log('✓ Books status index created');
        }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_books_sort_order ON books(sort_order)`, (err) => {
        if (err) {
            console.error('Error creating books sort order index:', err);
        } else {
            console.log('✓ Books sort order index created');
        }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_book_blurbs_book_id ON book_blurbs(book_id)`, (err) => {
        if (err) {
            console.error('Error creating book blurbs index:', err);
        } else {
            console.log('✓ Book blurbs index created');
        }
    });

});

// Close database connection
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('✓ Database initialized successfully!');
            console.log(`Database file: ${dbPath}`);
        }
    });
}, 1000);


