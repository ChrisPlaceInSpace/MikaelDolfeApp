const crypto = require('crypto');
const bcrypt = require('bcryptjs');


console.log('🔐 Generating secure secrets for production...\n');

// Generate session secret
const sessionSecret = crypto.randomBytes(32).toString('hex');
console.log('SESSION_SECRET=' + sessionSecret);

// Generate admin password hash
const adminPassword = process.argv[2] || 'admin123';
const adminUsername = process.argv[3] || 'admin';
const saltRounds = 12;
const passwordHash = bcrypt.hashSync(adminPassword, saltRounds);
console.log('ADMIN_USERNAME=' + adminUsername);
console.log('ADMIN_PASSWORD_HASH=' + passwordHash);

console.log('\n📝 Instructions:');
console.log('1. Copy the SESSION_SECRET to your .env file');
console.log('2. Copy the ADMIN_USERNAME to your .env file');
console.log('3. Copy the ADMIN_PASSWORD_HASH to your .env file');
console.log('4. Your admin username is:', adminUsername);
console.log('5. Your admin password is:', adminPassword);
console.log('6. Change the admin password after first login');

console.log('\n⚠️  Security Notes:');
console.log('- Never commit these secrets to version control');
console.log('- Use different secrets for each environment');
console.log('- Store secrets securely in your deployment platform');


