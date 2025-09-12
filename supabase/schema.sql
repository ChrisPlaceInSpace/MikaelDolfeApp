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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at);
CREATE INDEX IF NOT EXISTS idx_books_sort_order ON books(sort_order);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at);

-- Add price column to existing books table (if it doesn't exist)
ALTER TABLE books ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);

-- Add sort_order column to existing books table (if it doesn't exist)
ALTER TABLE books ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Enable Row Level Security (RLS)
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Public read access for books" ON books
    FOR SELECT USING (true);


CREATE POLICY "Public read access for blog posts" ON blog_posts
    FOR SELECT USING (status = 'published');

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

-- Insert sample data (optional)
INSERT INTO books (title, subtitle, description, status, release_date) VALUES
('Älska har sin tid - Boken om Nancy', 'Boken om Nancy', 'En gripande berättelse om kärlek, tid och livets utmaningar', 'published', '2024-01-01')
ON CONFLICT (id) DO NOTHING;


INSERT INTO blog_posts (title, excerpt, content, status) VALUES
('Välkommen till min blogg', 'En introduktion till min nya blogg om skrivande och konst', 'Välkommen till min blogg! Här kommer jag att dela tankar om skrivande, konst och livet som författare. Jag hoppas att du kommer att finna inspiration och intressanta perspektiv här.', 'published')
ON CONFLICT (id) DO NOTHING;

