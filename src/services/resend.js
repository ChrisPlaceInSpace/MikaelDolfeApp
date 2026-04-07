const { Resend } = require('resend');
require('dotenv').config();

class ResendService {
    constructor() {
        this.resend = null;
        this.isConfigured = false;
        
        // Initialize Resend if API key is available
        if (process.env.RESEND_API_KEY) {
            this.resend = new Resend(process.env.RESEND_API_KEY);
            this.isConfigured = true;
            console.log('✅ Resend service configured');
        } else {
            console.log('⚠️ Resend API key not found. Email functionality will be disabled.');
        }
    }

    /**
     * Send a contact form email
     * @param {Object} contactData - Contact form data
     * @param {string} contactData.name - Sender's name
     * @param {string} contactData.email - Sender's email
     * @param {string} contactData.subject - Email subject
     * @param {string} contactData.message - Email message
     * @returns {Promise<Object>} - Resend API response
     */
    async sendContactEmail(contactData) {
        if (!this.isConfigured) {
            throw new Error('Resend is not configured. Please set RESEND_API_KEY environment variable.');
        }

        const { name, email, subject, message } = contactData;
        
        // Validate required fields
        if (!name || !email || !message) {
            throw new Error('Missing required fields: name, email, and message are required.');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email address format.');
        }

        try {
            const emailData = {
                from: process.env.RESEND_FROM_EMAIL || 'noreply@mikaeldolfe.se',
                to: [process.env.RESEND_TO_EMAIL || 'kontakta@mikaeldolfe.se'],
                subject: `Kontakt från ${name}${subject ? ` - ${subject}` : ''}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Nytt kontaktmeddelande från mikaeldolfe.se</h2>
                        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <p><strong>Från:</strong> ${name}</p>
                            <p><strong>E-post:</strong> ${email}</p>
                            ${subject ? `<p><strong>Ämne:</strong> ${subject}</p>` : ''}
                        </div>
                        <div style="background-color: #fff; padding: 20px; border-left: 4px solid #007bff;">
                            <h3 style="color: #333; margin-top: 0;">Meddelande:</h3>
                            <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
                        </div>
                        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
                            <p>Detta meddelande skickades via kontaktformuläret på mikaeldolfe.se</p>
                            <p>Skickat: ${new Date().toLocaleString('sv-SE')}</p>
                        </div>
                    </div>
                `,
                replyTo: email
            };

            console.log('📧 Sending contact email via Resend...');
            const result = await this.resend.emails.send(emailData);
            console.log('✅ Contact email sent successfully, id:', result.data?.id || result.id);
            
            return {
                success: true,
                messageId: result.data?.id || result.id,
                message: 'Email sent successfully'
            };
        } catch (error) {
            console.error('❌ Error sending contact email:', error);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    /**
     * Send a confirmation email to the contact form submitter
     * @param {Object} contactData - Contact form data
     * @returns {Promise<Object>} - Resend API response
     */
    async sendConfirmationEmail(contactData) {
        if (!this.isConfigured) {
            throw new Error('Resend is not configured. Please set RESEND_API_KEY environment variable.');
        }

        const { name, email } = contactData;
        
        try {
            const emailData = {
                from: process.env.RESEND_FROM_EMAIL || 'noreply@mikaeldolfe.se',
                to: [email],
                subject: 'Tack för ditt meddelande - Mikael Dolfe',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Tack för ditt meddelande!</h2>
                        <p>Hej ${name},</p>
                        <p>Tack för att du tog dig tid att skicka ett meddelande. Jag har mottagit ditt meddelande och kommer att svara så snart som möjligt.</p>
                        <p>Med vänliga hälsningar,<br>Mikael Dolfe</p>
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
                            <p>Detta är ett automatiskt svar från mikaeldolfe.se</p>
                        </div>
                    </div>
                `
            };

            console.log('📧 Sending confirmation email via Resend...');
            const result = await this.resend.emails.send(emailData);
            console.log('✅ Confirmation email sent successfully, id:', result.data?.id || result.id);
            
            return {
                success: true,
                messageId: result.data?.id || result.id,
                message: 'Confirmation email sent successfully'
            };
        } catch (error) {
            console.error('❌ Error sending confirmation email:', error);
            throw new Error(`Failed to send confirmation email: ${error.message}`);
        }
    }

    /**
     * Check if Resend is properly configured
     * @returns {boolean} - True if configured, false otherwise
     */
    isServiceConfigured() {
        return this.isConfigured;
    }
}

module.exports = ResendService;
