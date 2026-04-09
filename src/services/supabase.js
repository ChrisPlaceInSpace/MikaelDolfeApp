const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
    constructor() {
        // Use service role key for admin operations (has full permissions)
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
        );
    }

    // Books operations
    async getAllBooks() {
        const { data, error } = await this.supabase
            .from('books')
            .select('*')
            .eq('status', 'published')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    }

    async getAllBooksAdmin() {
        const { data, error } = await this.supabase
            .from('books')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    }

    async getBook(id) {
        const { data, error } = await this.supabase
            .from('books')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        return data;
    }

    async createBook(bookData) {
        const { data, error } = await this.supabase
            .from('books')
            .insert([bookData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async updateBook(id, bookData) {
        const { data, error } = await this.supabase
            .from('books')
            .update(bookData)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async deleteBook(id) {
        const { error } = await this.supabase
            .from('books')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        return true;
    }

    // Book blurbs operations
    async getBookBlurbs(bookId) {
        const { data, error } = await this.supabase
            .from('book_blurbs')
            .select('*')
            .eq('book_id', bookId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    }

    async getAllBookBlurbs() {
        const { data, error } = await this.supabase
            .from('book_blurbs')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    }

    async getBlurb(id) {
        const { data, error } = await this.supabase
            .from('book_blurbs')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        return data;
    }

    async createBlurb(blurbData) {
        const { data, error } = await this.supabase
            .from('book_blurbs')
            .insert([blurbData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async updateBlurb(id, blurbData) {
        const { data, error } = await this.supabase
            .from('book_blurbs')
            .update(blurbData)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async deleteBlurb(id) {
        const { error } = await this.supabase
            .from('book_blurbs')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        return true;
    }

    // Orders operations
    async createOrder(orderData) {
        const { data, error } = await this.supabase
            .from('orders')
            .insert([orderData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async getOrderByPaymentIntentId(paymentIntentId) {
        const { data, error } = await this.supabase
            .from('orders')
            .select('*')
            .eq('stripe_payment_intent_id', paymentIntentId)
            .single();
        
        if (error) throw error;
        return data;
    }

    async updateOrderStatus(paymentIntentId, status) {
        const { data, error } = await this.supabase
            .from('orders')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', paymentIntentId)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async getAllOrders() {
        const { data, error } = await this.supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    }


    // Blog posts operations
    async getAllBlogPosts() {
        const { data, error } = await this.supabase
            .from('blog_posts')
            .select('*')
            .eq('status', 'published')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    }

    async getAllBlogPostsAdmin() {
        const { data, error } = await this.supabase
            .from('blog_posts')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    }

    async getBlogPost(id) {
        const { data, error } = await this.supabase
            .from('blog_posts')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        return data;
    }

    async createBlogPost(postData) {
        const { data, error } = await this.supabase
            .from('blog_posts')
            .insert([postData])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async updateBlogPost(id, postData) {
        const { data, error } = await this.supabase
            .from('blog_posts')
            .update(postData)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async deleteBlogPost(id) {
        const { error } = await this.supabase
            .from('blog_posts')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        return true;
    }

    // File storage operations
    async uploadFile(file, bucket, path) {
        const { data, error } = await this.supabase.storage
            .from(bucket)
            .upload(path, file.buffer, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.mimetype
            });
        
        if (error) throw error;
        return data;
    }

    async deleteFile(bucket, path) {
        const { error } = await this.supabase.storage
            .from(bucket)
            .remove([path]);
        
        if (error) throw error;
        return true;
    }

    getFileUrl(bucket, path) {
        const { data } = this.supabase.storage
            .from(bucket)
            .getPublicUrl(path);
        
        return data.publicUrl;
    }
}

module.exports = SupabaseService;

