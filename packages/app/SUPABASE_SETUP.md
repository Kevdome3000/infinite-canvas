# Supabase Authentication Setup Guide

This guide will help you configure the Supabase user authentication feature.

## 1. Create a Supabase project

1. Go to [Supabase](https://supabase.com) and log in
2. Create a new project
3. Wait for the project initialization to complete

## 2. Get an API key

1. In the Supabase project dashboard, go to Settings > API
2. Copy the following information:
    - **Project URL** (NEXT_PUBLIC_SUPABASE_URL)
    - **anon/public key** (NEXT_PUBLIC_SUPABASE_ANON_KEY)

## 3. Configure environment variables

1. Create a .env.local file in the packages/app directory
2. Add the following environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 4. Configure Supabase authentication

### Enable email authentication

1. In the Supabase project dashboard, go to **Authentication** > **Providers**
2. Make sure the Email provider is enabled
3. Configure Mailbox Settings (Optional):
    - Custom email templates
    - Set the email verification link validity period
    - Configure the redirect URL

### Configure the redirect URL

Set up in Authentication > URL Configuration:

- Site URL: 'http://localhost:3000' (development environment) or your production environment URL
- **Redirect URLs**: Add the following URLs:
    - 'http://localhost:3000/**' (development environment)
    - 'http://localhost:3000/auth/callback' (OAuth callback)
    - If deploying to production, add the URL of the production environment as well

### Enable Google OAuth sign-in

1. In the Supabase project dashboard, go to **Authentication** > **Providers**
2. Find the Google provider and click Enable
3. Configure Google OAuth:

#### Create OAuth credentials in the Google Cloud Console

1. Access the Google Cloud Console (https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API**:
    - Go to APIs & Services > Library
    - Search for "Google+ API" and enable it
4. Create an OAuth 2.0 Client ID:

   - Go to APIs & Services > Credentials
   - Click Create Credentials > OAuth client ID
   - Select Web application
   - Add authorization redirect URI:

    ```
    https://<your-project-ref>.supabase.co/auth/v1/callback
    ```

    (You can find this URL on the **Authentication** > **Providers** > **Google** pages of the Supabase project)
        - Click Create.
        - Copy the Client ID and Client Secret

5. Configure in Supabase:
        - Go back to Supabase's Authentication> Providers> Google
        - Paste the Client ID and Client Secret
        - Click **Save**

**Note**: Ensure that the redirect URI matches exactly what Supabase provides, including the protocol (https) and path.

### Enable GitHub OAuth sign-in

1. In the Supabase project dashboard, go to **Authentication** > **Providers**
2. Find the GitHub provider and click Enable
3. Configure GitHub OAuth:

#### Create an OAuth App in GitHub

1. Visit GitHub Developer Settings (https://github.com/settings/developers)
2. Click on **OAuth Apps** > **New OAuth App**
3. Fill in the application information:

   - **Application name**: The name of your app (e.g., My App)
     - Homepage URL: 'http://localhost:3000' (development environment) or your production environment URL
   - **Authorization callback URL**:

    ```plaintext
    https://<your-project-ref>.supabase.co/auth/v1/callback
    ```

    (You can find this URL on the Supabase project's Authentication> Providers> GitHub pages.)

4. Click **Register application**
5. Copy the Client ID
6. Click Generate a new client secret to generate and copy the client secret

7. Configure in Supabase:
    - Go back to Supabase's Authentication > Providers > GitHub pages
    - Paste the Client ID and Client Secret
    - Click **Save**

**Note**:

- Ensure that the callback URL matches exactly what Supabase provides, including the protocol (https) and path
- If your app needs access to a user's private repository, you can configure the appropriate permission scope in the GitHub OAuth App settings

## 5. Run the app

```bash
cd packages/app
pnpm dev
```

## Function description

### Implemented features

- ✅ User registration (email + password)
- ✅ User login (email + password)
- ✅ Google OAuth sign-in
- ✅ GitHub OAuth login
- ✅ Session management
- ✅ Routing protection (non-logged-in users are automatically redirected to the login page)
- ✅ Authentication status listening

### Usage

1. **Register as a New User**:

   - Visit the app homepage
   - Click on the "Register" tab
   - Enter your email address and password (at least 6 characters)
   - Click on the "Sign Up" button
   - Check your email address to verify your account (if email verification is enabled)

2. **Login**:

   - Visit the app homepage
   - Enter your email address and password in the "Login" tab
   - Click on the "Sign In" button

3. **Sign in with Google**:

   - Visit the app homepage
   - Click on the "Sign in with Google" button
   - Select Google Account in the pop-up window
   - Automatic login after authorization

4. **Log in with GitHub**:

   - Visit the app homepage
   - Click the "Sign in with GitHub" button
   - Select your GitHub account in the pop-up window
   - Automatic login after authorization

5. **Log Out**:
    - Tap the user avatar in the top right corner
    - Select "Sign out" in the drop-down menu

## Custom configuration

### Modify the certification process

- Login Components: 'packages/app/components/auth/login-form.tsx'
- Authentication context: 'packages/app/contexts/auth-context.tsx'
- Middleware configuration: 'packages/app/middleware.ts'

### Add additional authentication methods

Supabase supports multiple certification providers (Apple, Discord, Twitter, etc.). You can enable these providers in your Supabase dashboard and then add sign-in methods in a similar way in your code.

For example, to add additional OAuth providers:

1. Enable the appropriate provider in Supabase
2. Add the corresponding login method in 'auth-context.tsx' (e.g. 'signInWithApple')
3. Add the corresponding login button in 'login-form.tsx'

## Troubleshooting

### FAQs

1. **"Cannot find module '@supabase/ssr'"**

   - Run 'pnpm install' to make sure the dependency is installed

2. **Environment Variables Not Loading**

   - Make sure the '.env.local' file is in the 'packages/app' directory
   - Restart the development server

3. **Certification status not updated**

   - Check the browser console for errors
   - Verify that the Supabase URL and key are configured correctly

4. **Google sign-in failed**

   - Verify that Google OAuth credentials are properly configured in Supabase
   - Check that the redirect URI in the Google Cloud Console matches the exact match provided by Supabase
   - Make sure the Google+ API is enabled
   - Check the browser console for error messages

5. **GitHub Login Failed**
    - Verify that GitHub OAuth credentials are properly configured in Supabase
    - Check that the callback URL in your GitHub OAuth app matches the exact match provided by Supabase
    - Make sure the Client ID and Client Secret are copied correctly (be careful not to have extra spaces)
    - Check the browser console for error messages

## reference resources

-   [Supabase 文档](https://supabase.com/docs)
-   [Supabase Auth 文档](https://supabase.com/docs/guides/auth)
-   [Next.js + Supabase 指南](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
