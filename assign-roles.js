/**
 * Role Assignment Script
 * Assigns roles to users via Clerk Backend API
 * 
 * Usage: node assign-roles.js
 * 
 * Configure the ROLE_MAP below with your team's emails and desired roles:
 *   DEV = Developer (can submit requests)
 *   FIN = Finance (can review & process payments) 
 *   OWN = Owner/Founder (can approve requests)
 *   ADM = Admin (sees everything)
 */

require('dotenv').config();

const CLERK_SECRET = process.env.CLERK_SECRET_KEY;

// ═══════════════════════════════════════════════════════
// 🎯 CONFIGURE YOUR TEAM ROLES HERE
// ═══════════════════════════════════════════════════════
const ROLE_MAP = {
    'abakashray57@gmail.com': 'ADM',          // You - System Admin
    'cse2022017@rcciit.org.in': 'OWN',        // Founder / Owner
    'rayabakash@gmail.com': 'FIN',            // Finance
};
// ═══════════════════════════════════════════════════════

async function assignRoles() {
    console.log('\n🔐 Clerk Role Assignment Tool\n');
    console.log('═'.repeat(50));

    for (const [email, role] of Object.entries(ROLE_MAP)) {
        process.stdout.write(`\n📧 ${email} → ${role} ... `);

        // Step 1: Find user by email
        const searchRes = await fetch(
            `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
            { headers: { 'Authorization': `Bearer ${CLERK_SECRET}` } }
        );
        const users = await searchRes.json();

        if (!Array.isArray(users) || users.length === 0) {
            console.log('⏳ NOT YET SIGNED UP (will be assigned when they register)');
            continue;
        }

        const user = users[0];
        const userId = user.id;
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';

        // Step 2: Assign role via public_metadata
        const updateRes = await fetch(
            `https://api.clerk.com/v1/users/${userId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${CLERK_SECRET}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ public_metadata: { role } }),
            }
        );

        if (updateRes.ok) {
            console.log(`✅ ASSIGNED! (${name})`);
        } else {
            const err = await updateRes.json();
            console.log(`❌ FAILED: ${JSON.stringify(err)}`);
        }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('✨ Done! Users will see their new roles on next login/refresh.\n');
}

assignRoles().catch(console.error);
