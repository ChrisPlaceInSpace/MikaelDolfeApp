const Stripe = require('stripe');
require('dotenv').config();

class StripeService {
    constructor() {
        this.stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        this.publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        
        // Only initialize Stripe if we have the secret key
        if (this.stripeSecretKey) {
            this.stripe = new Stripe(this.stripeSecretKey);
            console.log('✅ Stripe configured successfully');
        } else {
            this.stripe = null;
            console.log('⚠️  Stripe not configured - payment features will be disabled');
        }
    }

    // Create a payment intent for a book purchase
    async createPaymentIntent(book, customerInfo) {
        if (!this.stripe) {
            throw new Error('Stripe is not configured');
        }
        
        try {
            const amount = Math.round(book.price * 100); // Convert to cents

            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: amount,
                currency: 'sek',
                payment_method_types: ['card'], // Only allow credit cards
                metadata: {
                    book_id: book.id.toString(),
                    book_title: book.title,
                    customer_name: customerInfo.name,
                    customer_email: customerInfo.email,
                    customer_phone: customerInfo.phone,
                    delivery_address: JSON.stringify(customerInfo.deliveryAddress)
                },
                description: `Purchase of "${book.title}" by ${customerInfo.name}`,
                receipt_email: customerInfo.email,
                shipping: {
                    name: customerInfo.name,
                    phone: customerInfo.phone,
                    address: {
                        line1: customerInfo.deliveryAddress.address,
                        line2: customerInfo.deliveryAddress.address2 || '',
                        city: customerInfo.deliveryAddress.city,
                        postal_code: customerInfo.deliveryAddress.postalCode,
                        country: 'SE'
                    }
                }
            });

            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id
            };
        } catch (error) {
            console.error('Error creating payment intent:', error);
            throw new Error('Failed to create payment intent');
        }
    }

    // Retrieve a payment intent
    async retrievePaymentIntent(paymentIntentId) {
        if (!this.stripe) {
            throw new Error('Stripe is not configured');
        }
        
        try {
            return await this.stripe.paymentIntents.retrieve(paymentIntentId);
        } catch (error) {
            console.error('Error retrieving payment intent:', error);
            throw new Error('Failed to retrieve payment intent');
        }
    }

    // Create a refund
    async createRefund(paymentIntentId, amount = null) {
        if (!this.stripe) {
            throw new Error('Stripe is not configured');
        }
        
        try {
            const refundData = {
                payment_intent: paymentIntentId
            };

            if (amount) {
                refundData.amount = Math.round(amount * 100); // Convert to cents
            }

            return await this.stripe.refunds.create(refundData);
        } catch (error) {
            console.error('Error creating refund:', error);
            throw new Error('Failed to create refund');
        }
    }

    // Verify webhook signature
    verifyWebhookSignature(payload, signature) {
        if (!this.stripe) {
            throw new Error('Stripe is not configured');
        }
        
        try {
            return this.stripe.webhooks.constructEvent(
                payload,
                signature,
                this.webhookSecret
            );
        } catch (error) {
            console.error('Webhook signature verification failed:', error);
            throw new Error('Invalid webhook signature');
        }
    }

    // Get publishable key
    getPublishableKey() {
        return this.publishableKey || 'pk_test_stripe_not_configured';
    }
}

module.exports = StripeService;


