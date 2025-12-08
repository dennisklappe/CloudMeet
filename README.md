# CloudMeet

A free, open-source meeting scheduler that runs on Cloudflare. Open-source Calendly alternative with Google Calendar and Outlook Calendar integration.

![CloudMeet Booking Page](static/screenshot.png)

**[Live Demo](https://meet.klappe.dev/cloudmeet)**

## Features

- Google Calendar and Outlook Calendar integration
- Use Google alone, Outlook alone, or both calendars together
- Automatic event creation with Google Meet or Microsoft Teams links
- Customizable availability and working hours
- Multiple event types (30 min, 1 hour, etc.)
- Configurable email notifications (confirmation, cancellation, reminders)
- Email settings dashboard to enable/disable and customize emails
- One-click deploy and update via GitHub Actions
- Runs entirely on Cloudflare's free tier

## Quick Start

### 1. Create Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Select **Edit Cloudflare Workers** template
4. Under **Account Resources**, select your account
5. Click **+ Add more** and add: **Account → D1 → Edit**
6. Click **Continue to summary** → **Create Token**
7. Copy the token for step 4

### 2. Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Go to **APIs & Services** > **Library** > Enable **Google Calendar API**
4. Go to **APIs & Services** > **Credentials**
5. Click **Create Credentials** > **OAuth 2.0 Client ID**
6. Application type: **Web application**
7. Add authorized redirect URI: `https://YOUR-PROJECT.pages.dev/auth/callback`
   - Replace `YOUR-PROJECT` with your Cloudflare Pages project name (you'll get this URL after first deploy, or use your custom domain if you already have one)
   - You can add multiple redirect URIs, so add both the default and custom domain if needed
8. Save your **Client ID** and **Client Secret** for step 4

### 3. Create your repository

Click **Use this template** > **Create a new repository**.

### 4. Add Repository Secrets

Go to your new repo's **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.

Add these secrets (click "New repository secret" for each one):

| Secret | Required | Description |
|--------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Your Cloudflare API token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your [Cloudflare Account ID](https://dash.cloudflare.com) (right sidebar) |
| `ADMIN_EMAIL` | Yes | Your Google email (only this account can login) |
| `JWT_SECRET` | Yes | Random string for session tokens ([generate one](https://generate-secret.vercel.app/32)) |
| `APP_URL` | Yes | Your app URL (e.g., `https://YOUR-PROJECT.pages.dev` or your custom domain) |
| `GOOGLE_CLIENT_ID` | Yes | From step 2 (ends with `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Yes | From step 2 |
| `EMAILIT_API_KEY` | No | [Emailit](https://emailit.com) API key for booking emails |
| `EMAIL_FROM` | No | From address (e.g., `noreply@yourdomain.com`) |
| `CRON_SECRET` | No | Secures reminder endpoint ([generate one](https://generate-secret.vercel.app/32)) |
| `MICROSOFT_CLIENT_ID` | No | For Outlook Calendar integration (see below) |
| `MICROSOFT_CLIENT_SECRET` | No | For Outlook Calendar integration (see below) |

### 5. Deploy

Go to **Actions** > **Deploy to Cloudflare Pages** > **Run workflow** > **Run workflow**.

Your app will be live at `https://YOUR-PROJECT.pages.dev`.

### Custom Domain (Optional)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) > **Pages** > **cloudmeet** > **Custom domains**
2. Add your domain
3. Update `APP_URL` secret to your new domain
4. Update redirect URI in [Google Cloud Console](https://console.cloud.google.com/) to `https://yourdomain.com/auth/callback`
5. Re-run the deploy workflow

## Updating

To get the latest updates from the template and deploy:

1. Go to **Actions** > **Sync and Deploy** > **Run workflow** > **Run workflow**

This will sync with the upstream CloudMeet template and automatically deploy to Cloudflare.

Alternatively, you can run **Upstream Sync** and **Deploy to Cloudflare Pages** separately.

If sync fails with a permissions error, [create a personal access token](https://github.com/settings/tokens/new) with `Contents` and `Workflows` permissions, and paste it in the token field when running the workflow.

## Email Reminders

Email reminders are automatically enabled when you deploy. A Cloudflare Worker runs every 5 minutes to check for and send scheduled reminders (24h, 1h before meetings).

**Note:** The `CRON_SECRET` is optional but recommended. Without it, the reminder endpoint is publicly accessible (anyone could trigger reminder sends). With it, only the cron worker can trigger reminders.

To add the secret:
1. Add a `CRON_SECRET` to your GitHub secrets (any random string)
2. Re-deploy via **Actions** > **Deploy to Cloudflare Pages**

The cron worker is deployed automatically alongside the main app.

## Outlook Calendar Integration (Optional)

CloudMeet supports Microsoft Outlook Calendar in addition to Google Calendar. You can use Google alone, Outlook alone, or both together. When both are connected, availability is checked across both calendars.

### Setup Microsoft OAuth

1. Go to [Azure Portal](https://portal.azure.com/) > **App registrations** > **New registration**
2. Name: `CloudMeet` (or your preferred name)
3. Supported account types: **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**
4. Redirect URI: **Web** > `https://YOUR-DOMAIN/auth/outlook/callback`
5. Click **Register**
6. Copy the **Application (client) ID** - this is your `MICROSOFT_CLIENT_ID`
7. Go to **Certificates & secrets** > **New client secret**
8. Copy the secret value - this is your `MICROSOFT_CLIENT_SECRET`
9. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**
10. Add these permissions:
    - `Calendars.ReadWrite`
    - `User.Read`
    - `OnlineMeetings.ReadWrite` (for Teams meeting links)
11. Click **Grant admin consent** (if you have admin access, otherwise users consent on first login)

### Add Secrets

Add `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` to your GitHub secrets and re-deploy.

### Usage

Once configured, users can connect their Outlook calendar from the dashboard:
- Go to **Dashboard** > **Calendar Integrations**
- Click **Connect** next to Outlook Calendar
- Choose which calendars to use for availability checking
- Select preferred meeting provider (Google Meet, Teams, or none)

## Local Development

```bash
cp .env.example .dev.vars  # Add your credentials
npm install
npm run db:init
npm run dev
```

## License

MIT
