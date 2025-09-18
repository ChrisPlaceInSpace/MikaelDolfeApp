-- Enable Row Level Security


-- Create tables
CREATE TABLE IF NOT EXISTS books (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    subtitle VARCHAR(200),
    description TEXT,
    cover_image TEXT,
    price DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'draft',
    release_date DATE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS blog_posts (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS book_blurbs (
    id BIGSERIAL PRIMARY KEY,
    book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    quotation TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    book_id BIGINT NOT NULL REFERENCES books(id),
    stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    delivery_address JSONB NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'SEK',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at);
CREATE INDEX IF NOT EXISTS idx_books_sort_order ON books(sort_order);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_book_blurbs_book_id ON book_blurbs(book_id);
CREATE INDEX IF NOT EXISTS idx_book_blurbs_created_at ON book_blurbs(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Add price column to existing books table (if it doesn't exist)
ALTER TABLE books ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);

-- Add sort_order column to existing books table (if it doesn't exist)
ALTER TABLE books ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Enable Row Level Security (RLS)
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_blurbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Public read access for books" ON books
    FOR SELECT USING (true);


CREATE POLICY "Public read access for blog posts" ON blog_posts
    FOR SELECT USING (status = 'published');

CREATE POLICY "Public read access for book blurbs" ON book_blurbs
    FOR SELECT USING (true);

CREATE POLICY "Public read access for orders" ON orders
    FOR SELECT USING (true);

-- Create policies for admin access (using service role key bypasses RLS)
-- For authenticated admin users, we'll use the service role key in our backend
-- This is more secure than trying to implement complex JWT-based policies

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_books_updated_at ON books;
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_book_blurbs_updated_at ON book_blurbs;
CREATE TRIGGER update_book_blurbs_updated_at BEFORE UPDATE ON book_blurbs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data (optional)
INSERT INTO books (title, subtitle, description, status, release_date) VALUES
('Älska har sin tid - Boken om Nancy', 'Boken om Nancy', 'En gripande berättelse om kärlek, tid och livets utmaningar', 'published', '2024-01-01')
ON CONFLICT (id) DO NOTHING;


INSERT INTO blog_posts (title, excerpt, content, status) VALUES
('Välkommen till min blogg', 'En introduktion till min nya blogg om skrivande och konst', 'Välkommen till min blogg! Här kommer jag att dela tankar om skrivande, konst och livet som författare. Jag hoppas att du kommer att finna inspiration och intressanta perspektiv här.', 'published')
ON CONFLICT (id) DO NOTHING;

-- Insert sample blurbs for the first book
INSERT INTO book_blurbs (book_id, name, quotation) VALUES
(3, 'Anna Lindberg, Litteraturkritiker', 'En mästerlig berättelse som fångar läsaren från första sidan. Mikael Dolfe har skapat en roman som både rör och utmanar.'),
(3, 'Erik Johansson, Författare', 'En gripande skildring av kärlek och förlust. Dolfe visar stor mognad i sitt skrivande och levererar en bok som kommer att stanna hos läsaren länge efter att sista sidan är läst.'),
(3, 'Maria Svensson, Bokhandlare', 'Våra kunder älskar denna bok! Den har blivit en av våra bästsäljare och vi får ständigt positiva kommentarer från läsare som uppskattar både berättelsen och skrivstilen.')
ON CONFLICT (id) DO NOTHING;

