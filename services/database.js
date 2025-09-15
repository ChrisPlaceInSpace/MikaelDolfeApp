const sqlite3 = require('sqlite3').verbose();
const SupabaseService = require('./supabase');

class DatabaseManager {
    constructor() {
        this.databaseType = process.env.DATABASE_TYPE || 'sqlite';
        this.supabase = null;
        this.sqlite = null;
        
        this.initialize();
    }

    initialize() {
        if (this.databaseType === 'supabase') {
            this.supabase = new SupabaseService();
            console.log('🔗 Using Supabase database');
        } else {
            this.sqlite = new sqlite3.Database('./database/mikael-dolfe.db');
            console.log('💾 Using SQLite database');
        }
    }

    // Books operations
    async getAllBooks() {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getAllBooks();
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.all('SELECT * FROM books WHERE status = ? ORDER BY sort_order ASC, created_at DESC', ['published'], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }

    async getAllBooksAdmin() {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getAllBooksAdmin();
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.all('SELECT * FROM books ORDER BY sort_order ASC, created_at DESC', (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }

    async getBook(id) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getBook(id);
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.get('SELECT * FROM books WHERE id = ?', [id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
    }

    async createBook(bookData) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.createBook(bookData);
        } else {
            return new Promise((resolve, reject) => {
                const { title, subtitle, description, cover_image, status, release_date, sort_order, created_at, updated_at } = bookData;
                this.sqlite.run(
                    'INSERT INTO books (title, subtitle, description, cover_image, status, release_date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [title, subtitle, description, cover_image, status, release_date, sort_order || 0, created_at, updated_at],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID, ...bookData });
                    }
                );
            });
        }
    }

    async updateBook(id, bookData) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.updateBook(id, bookData);
        } else {
            return new Promise((resolve, reject) => {
                // Build dynamic SQL query for partial updates
                const fields = [];
                const values = [];
                
                Object.keys(bookData).forEach(key => {
                    if (bookData[key] !== undefined) {
                        fields.push(`${key} = ?`);
                        values.push(bookData[key]);
                    }
                });
                
                if (fields.length === 0) {
                    return resolve({ id, ...bookData });
                }
                
                values.push(id);
                const sql = `UPDATE books SET ${fields.join(', ')} WHERE id = ?`;
                
                this.sqlite.run(sql, values, function(err) {
                    if (err) reject(err);
                    else resolve({ id, ...bookData });
                });
            });
        }
    }

    async deleteBook(id) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.deleteBook(id);
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.run('DELETE FROM books WHERE id = ?', [id], function(err) {
                    if (err) reject(err);
                    else resolve(true);
                });
            });
        }
    }

    // Book blurbs operations
    async getBookBlurbs(bookId) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getBookBlurbs(bookId);
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.all('SELECT * FROM book_blurbs WHERE book_id = ? ORDER BY created_at DESC', [bookId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }

    async getAllBookBlurbs() {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getAllBookBlurbs();
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.all('SELECT * FROM book_blurbs ORDER BY created_at DESC', (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }

    async getBlurb(id) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getBlurb(id);
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.get('SELECT * FROM book_blurbs WHERE id = ?', [id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
    }

    async createBlurb(blurbData) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.createBlurb(blurbData);
        } else {
            return new Promise((resolve, reject) => {
                const { book_id, name, quotation, created_at, updated_at } = blurbData;
                this.sqlite.run(
                    'INSERT INTO book_blurbs (book_id, name, quotation, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                    [book_id, name, quotation, created_at, updated_at],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID, ...blurbData });
                    }
                );
            });
        }
    }

    async updateBlurb(id, blurbData) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.updateBlurb(id, blurbData);
        } else {
            return new Promise((resolve, reject) => {
                // Build dynamic SQL query for partial updates
                const fields = [];
                const values = [];
                
                Object.keys(blurbData).forEach(key => {
                    if (blurbData[key] !== undefined) {
                        fields.push(`${key} = ?`);
                        values.push(blurbData[key]);
                    }
                });
                
                if (fields.length === 0) {
                    return resolve({ id, ...blurbData });
                }
                
                values.push(id);
                const sql = `UPDATE book_blurbs SET ${fields.join(', ')} WHERE id = ?`;
                
                this.sqlite.run(sql, values, function(err) {
                    if (err) reject(err);
                    else resolve({ id, ...blurbData });
                });
            });
        }
    }

    async deleteBlurb(id) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.deleteBlurb(id);
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.run('DELETE FROM book_blurbs WHERE id = ?', [id], function(err) {
                    if (err) reject(err);
                    else resolve(true);
                });
            });
        }
    }


    // Blog posts operations
    async getAllBlogPosts() {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getAllBlogPosts();
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.all('SELECT * FROM blog_posts WHERE status = ? ORDER BY created_at DESC', ['published'], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }

    async getAllBlogPostsAdmin() {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getAllBlogPostsAdmin();
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.all('SELECT * FROM blog_posts ORDER BY created_at DESC', (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }

    async getBlogPost(id) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.getBlogPost(id);
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.get('SELECT * FROM blog_posts WHERE id = ?', [id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
    }

    async createBlogPost(postData) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.createBlogPost(postData);
        } else {
            return new Promise((resolve, reject) => {
                const { title, excerpt, content, status, created_at, updated_at } = postData;
                this.sqlite.run(
                    'INSERT INTO blog_posts (title, excerpt, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [title, excerpt, content, status, created_at, updated_at],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID, ...postData });
                    }
                );
            });
        }
    }

    async updateBlogPost(id, postData) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.updateBlogPost(id, postData);
        } else {
            return new Promise((resolve, reject) => {
                const { title, excerpt, content, status, updated_at } = postData;
                this.sqlite.run(
                    'UPDATE blog_posts SET title = ?, excerpt = ?, content = ?, status = ?, updated_at = ? WHERE id = ?',
                    [title, excerpt, content, status, updated_at, id],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id, ...postData });
                    }
                );
            });
        }
    }

    async deleteBlogPost(id) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.deleteBlogPost(id);
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.run('DELETE FROM blog_posts WHERE id = ?', [id], function(err) {
                    if (err) reject(err);
                    else resolve(true);
                });
            });
        }
    }

    // File operations
    async uploadFile(file, bucket, path) {
        if (this.databaseType === 'supabase') {
            return await this.supabase.uploadFile(file, bucket, path);
        } else {
            // For SQLite, we'll just return the local path
            return { path: `/uploads/${bucket}/${file.filename}` };
        }
    }

    getFileUrl(bucket, path) {
        if (this.databaseType === 'supabase') {
            return this.supabase.getFileUrl(bucket, path);
        } else {
            // For SQLite, return local path
            return path;
        }
    }

    // Close connections
    close() {
        if (this.sqlite) {
            this.sqlite.close();
        }
    }
}

module.exports = DatabaseManager;

