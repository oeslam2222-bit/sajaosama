# Captain Ezz - Security & Deployment Guide

## 🔒 Security Implementation Summary

### 1. Direct Database Connection
- The app connects directly to Supabase from the client using the anon key
- All operations (read/write) happen directly through Supabase client
- No Edge Functions required

### 2. Password Security - UPGRADED ✅
- **Old**: Base64 obfuscation (weak)
- **New**: PBKDF2 + SHA-256 with 100,000 iterations (strong)
- Uses Web Crypto API with fallback for older browsers
- Backward compatible with old password format during migration

### 3. Rate Limiting - IMPLEMENTED ✅
- **Rider auth**: 5 attempts per minute
- **Driver auth**: 5 attempts per minute
- **Admin auth**: 3 attempts per minute
- Prevents brute force attacks

### 4. Audit Logging - IMPLEMENTED ✅
- All sensitive actions logged with timestamp, user ID, and success status
- Logs stored in localStorage (extendable to Supabase audit table)
- Actions tracked: login, signup, trip operations, driver management, etc.

### 5. Legal Compliance - ADDED ✅
- Privacy Policy (Arabic + English)
- Terms of Service (Arabic + English)
- Data Retention Policy (Arabic + English)
- Accessible from Admin Panel → "Privacy & Compliance" tab

### 6. Backup Strategy - IMPLEMENTED ✅
- Export functionality: Downloads JSON backup of all data
- Import functionality: Restore from JSON backup
- Accessible from code via `exportBackup()` and `importBackup()` utilities

## 🚀 Deployment Steps

### Step 1: Setup Supabase Database

Run the SQL schema from `src/supabaseService.ts` (the `SQL_SCHEMA` string) in your Supabase SQL Editor.

This will:
- Create all tables (locations, riders, drivers, trips, stats, admin)
- Enable RLS on all tables
- Create policies allowing direct client operations

### Step 2: Update Environment Variables

In your `.env` file, ensure you have:
```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Step 3: Test the Application

```bash
# Start development server
npm run dev

# Build for production
npm run build
```

### Step 4: Deploy to GitHub Pages

```bash
# Build the project
npm run build

# Deploy to GitHub Pages (if using gh-pages)
npm run deploy
```

## 📋 Security Checklist Before Production

- [ ] RLS is enabled on all tables
- [ ] Supabase anon key is configured in `.env`
- [ ] Rate limiting is active
- [ ] Password hashing is working (new users get PBKDF2 hashes)
- [ ] Audit logging is enabled
- [ ] Privacy policy and terms of service are shown to users
- [ ] Old demo credentials are removed (01012345678 / 123456)
- [ ] HTTPS is enabled (required for GPS and notifications)
- [ ] PWA manifest and service worker are configured
- [ ] Backup/export functionality is tested

## 🔧 Maintenance

### Rotate Keys
If the anon key is compromised:
1. Go to Supabase Dashboard → Settings → API Keys
2. Regenerate the anon key
3. Update it in your `.env` file
4. Redeploy the app

### Monitor Logs
- Check Supabase Dashboard → Logs for database errors
- Monitor audit logs for suspicious activity
- Review rate limit hits

### Backup Schedule
- Use `exportBackup()` to create regular backups
- Store backups securely offsite
- Test restore procedure monthly

## ⚠️ Important Notes

1. **Direct database access**: All operations happen directly through Supabase client. No server-side proxy is used.

2. **Anon key is public**: The anon key is embedded in the client code. Security relies on RLS policies, not key secrecy.

3. **RLS policies**: The SQL schema includes policies that allow direct client operations. Review and adjust them if needed for your use case.

4. **Backward compatibility**: Old passwords stored with base64 obfuscation will still work during migration. New passwords use PBKDF2.

5. **Backup is client-side**: The backup utility exports from localStorage. For production, consider server-side backups.

## 🆘 Troubleshooting

### "RLS policy violation" error
- Ensure you've run the SQL schema in Supabase SQL Editor
- Check that RLS policies are correctly configured
- Verify the anon key has the correct permissions

### "Table not found" error
- Run the SQL schema from `src/supabaseService.ts` in Supabase SQL Editor
- Check table names match exactly

### Passwords not working after update
- Old passwords use base64, new ones use PBKDF2
- The app supports both formats during migration
- Users can reset passwords if needed

### GPS not working
- GPS requires HTTPS in production
- Test on localhost with `npm run dev`
- Ensure browser has location permissions

## 📞 Support

For issues or questions:
- Check Supabase logs in Dashboard → Logs
- Review audit logs in browser localStorage (key: `ezz_audit_logs`)
- Contact development team
