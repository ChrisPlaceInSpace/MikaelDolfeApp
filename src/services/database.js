const SupabaseService = require('./supabase');

/**
 * Database facade — Supabase only (SQLite support removed).
 */
class DatabaseManager {
    constructor() {
        const dbType = process.env.DATABASE_TYPE || 'supabase';
        if (dbType !== 'supabase') {
            throw new Error(
                'This deployment uses Supabase only. Set DATABASE_TYPE=supabase (or unset DATABASE_TYPE). SQLite is no longer supported.'
            );
        }
        this.supabase = new SupabaseService();
        console.log('🔗 Using Supabase database');
    }

    async getAllBooks() {
        return this.supabase.getAllBooks();
    }

    async getAllBooksAdmin() {
        return this.supabase.getAllBooksAdmin();
    }

    async getBook(id) {
        return this.supabase.getBook(id);
    }

    async createBook(bookData) {
        return this.supabase.createBook(bookData);
    }

    async updateBook(id, bookData) {
        return this.supabase.updateBook(id, bookData);
    }

    async deleteBook(id) {
        return this.supabase.deleteBook(id);
    }

    async getBookBlurbs(bookId) {
        return this.supabase.getBookBlurbs(bookId);
    }

    async getAllBookBlurbs() {
        return this.supabase.getAllBookBlurbs();
    }

    async getHomepageBlurbs() {
        return this.supabase.getHomepageBlurbs();
    }

    async getBlurb(id) {
        return this.supabase.getBlurb(id);
    }

    async createBlurb(blurbData) {
        return this.supabase.createBlurb(blurbData);
    }

    async updateBlurb(id, blurbData) {
        return this.supabase.updateBlurb(id, blurbData);
    }

    async deleteBlurb(id) {
        return this.supabase.deleteBlurb(id);
    }

    async createOrder(orderData) {
        return this.supabase.createOrder(orderData);
    }

    async getOrderByPaymentIntentId(paymentIntentId) {
        return this.supabase.getOrderByPaymentIntentId(paymentIntentId);
    }

    async updateOrderStatus(paymentIntentId, status) {
        return this.supabase.updateOrderStatus(paymentIntentId, status);
    }

    async getAllOrders() {
        return this.supabase.getAllOrders();
    }

    async getAllBlogPosts() {
        return this.supabase.getAllBlogPosts();
    }

    async getAllBlogPostsAdmin() {
        return this.supabase.getAllBlogPostsAdmin();
    }

    async getBlogPost(id) {
        return this.supabase.getBlogPost(id);
    }

    async createBlogPost(postData) {
        return this.supabase.createBlogPost(postData);
    }

    async updateBlogPost(id, postData) {
        return this.supabase.updateBlogPost(id, postData);
    }

    async deleteBlogPost(id) {
        return this.supabase.deleteBlogPost(id);
    }

    async uploadFile(file, bucket, path) {
        return this.supabase.uploadFile(file, bucket, path);
    }

    getFileUrl(bucket, path) {
        return this.supabase.getFileUrl(bucket, path);
    }

    close() {
        // Supabase client needs no explicit close
    }
}

module.exports = DatabaseManager;
