const fs = require('fs');
const path = require('path');

console.log('🚀 Pre-deployment checklist...\n');

const checks = [
    {
        name: 'Environment Variables',
        check: () => {
            const required = [
                'SUPABASE_URL',
                'SUPABASE_ANON_KEY', 
                'SUPABASE_SERVICE_ROLE_KEY',
                'STRIPE_SECRET_KEY',
                'STRIPE_PUBLISHABLE_KEY',
                'SESSION_SECRET'
            ];
            
            const missing = required.filter(env => !process.env[env]);
            if (missing.length > 0) {
                return `Missing: ${missing.join(', ')}`;
            }
            return 'OK';
        }
    },
    {
        name: 'Security Packages',
        check: () => {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            const required = ['helmet', 'express-rate-limit', 'express-slow-down', 'express-validator', 'xss'];
            const missing = required.filter(pkg => !packageJson.dependencies[pkg]);
            if (missing.length > 0) {
                return `Missing: ${missing.join(', ')}`;
            }
            return 'OK';
        }
    },
    {
        name: 'Database Configuration',
        check: () => {
            const t = process.env.DATABASE_TYPE || 'supabase';
            if (t === 'supabase') return 'OK';
            return `Invalid DATABASE_TYPE=${t} (use supabase only)`;
        }
    },
    {
        name: 'Node Environment',
        check: () => {
            const env = process.env.NODE_ENV || 'development';
            if (env !== 'production') {
                return `Warning: NODE_ENV=${env} (set to 'production' before deploying)`;
            }
            return 'OK';
        }
    },
    {
        name: 'File Structure',
        check: () => {
            const required = [
                'server.js',
                'package.json',
                'src/services/database.js',
                'src/services/supabase.js',
                'src/views/index.ejs'
            ];
            
            const missing = required.filter(file => !fs.existsSync(file));
            if (missing.length > 0) {
                return `Missing: ${missing.join(', ')}`;
            }
            return 'OK';
        }
    }
];

let allPassed = true;

checks.forEach(check => {
    const result = check.check();
    const isOk = result === 'OK';
    const isWarning = result.startsWith('Warning:');
    const status = isOk ? '✅' : isWarning ? '⚠️ ' : '❌';
    if (!isOk && !isWarning) allPassed = false;
    
    console.log(`${status} ${check.name}: ${result}`);
});

console.log('\n' + '='.repeat(50));

if (allPassed) {
    console.log('🎉 All checks passed! Ready for deployment.');
    console.log('\n📋 Next steps:');
    console.log('1. Set NODE_ENV=production');
    console.log('2. Configure production environment variables');
    console.log('3. Test the application');
    console.log('4. Deploy to your chosen platform');
} else {
    console.log('⚠️  Some checks failed. Please fix the issues above.');
    process.exit(1);
}


