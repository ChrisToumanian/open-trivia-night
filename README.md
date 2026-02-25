# 🍻 Open Trivia Night

Trivia night, made effortless. This app bundles everything a host needs into a single, reliable setup: a polished host dashboard for running rounds, a frictionless play page for teams to join in seconds, and a clean questions view that keeps the room focused on the fun. It is lightweight, fast to deploy, and easy to run on a single server, so you can spend less time troubleshooting and more time delivering a memorable trivia night.

## Why hosts love it
- One server, one command: the web UI and API run together.
- Fast team onboarding: players join with a team name and 4-digit code.
- Smooth game flow: question navigation, scoring, and totals stay in one place.
- Easy to brand: swap logos, colors, and copy without touching code.
- Built for busy nights: minimal setup, predictable URLs, quick resets.

## ⚡ Quick start
1. Install dependencies: `npm install`
2. Start the server: `npm start`
   - The server runs on port 8080 by default (or use `PORT=3000 npm start` for a custom port)
   - Uses HTTPS if SSL certificates are found, otherwise HTTP
3. Open the pages:
	- http://localhost:8080/host.html (or https:// if using SSL)
	- http://localhost:8080/play.html
	- http://localhost:8080/questions.html

## How it works
- Host opens `host.html` to run the game, review answers, and award points.
- Teams open `play.html`, join with the passcode, and submit answers.
- `questions.html` guides teams through each question.
- The API is available at `/api/*` and stores data in SQLite.
- Static files (HTML, CSS, JS) and API endpoints all run on a single port.

## Previews

<table>
	<tbody>
		<tr>
			<td><img src="shared/images/previews/join_game_preview.jpg" alt="Join Game preview" width="260" /></td>
			<td><img src="shared/images/previews/questions_preview.jpg" alt="Questions preview" width="260" /></td>
		</tr>
		<tr>
			<td colspan="2" align="center"><img src="shared/images/previews/control_panel_preview.jpg" alt="Control Panel preview" width="520" /></td>
		</tr>
	</tbody>
</table>

## CI and PR checks
This repo includes a GitHub Actions workflow that runs on every pull request.

What it checks:
- Lint: JavaScript syntax checks for the API and frontend scripts.
- Tests: SQLite smoke test to confirm dependencies install and the driver works.

To require these checks on PRs:
1. Go to GitHub repo settings.
2. Open Branch protection rules for your default branch.
3. Enable "Require status checks to pass before merging".
4. Select the checks named "Lint" and "Tests".

## Contents
- host.html — Admin/control panel interface
- play.html — Participant join page
- questions.html — Quiz/questions interface
- styles.css — Shared styles

## ▶️ How to use it
The Node server in `api/https-server.js` serves both the frontend and API on a single port (default 8080).

### Open the app
- Host dashboard: http://localhost:8080/host.html
- Team join page: http://localhost:8080/play.html
- Questions view: http://localhost:8080/questions.html
- API endpoints: http://localhost:8080/api/*

### Typical game flow
1. Host opens `host.html` and shares the 4-digit passcode.
2. Teams join at `play.html`, enter a team name and passcode.
3. Teams answer questions in `questions.html`.
4. Host reviews answers, awards points, and advances questions.

## 🎨 Customize the look
Branding defaults live in shared and are loaded automatically by the frontend.

- Default brand file: `shared/brand.default.json`
- Optional override (ignored by git): `shared/brand.json`

To change the theme, copy `shared/brand.default.json` to `shared/brand.json` and edit the override. The app will prefer the override if it exists.

Other easy customization points:
- Header logo: Replace `images/logo-header.png` and/or edit `header.html`.
- Footer text/links: Edit `footer.html`.
- Page titles: Update the `<title>` tags in `host.html`, `play.html`, and `questions.html`.
- Favicon: Update the `<link rel="icon">` in each page and replace the icon file in `images/`.
- Colors, fonts, spacing: Adjust shared styles in `styles.css` (e.g., `:root` variables and component classes like `.card`, `.btn`, `.pill`).
- Button labels and UI text: Edit `play.html`, `questions.html`, and `host.html`.


# 🧩 Open Trivia Night API

## 🛠️ Setup instructions
Follow these steps to set up the project from scratch.

### 1. Install Node.js

If you don't have Node.js installed, download and install it from [nodejs.org](https://nodejs.org/). Recommended version: Node.js 18.x or later.

Alternatively, on Ubuntu you can run:

```
sudo apt update
sudo apt install nodejs npm
```

### 2. Clone the repository

If you haven't already, clone this repository:

```
git clone <repository-url>
cd open-trivia-night
```

### 3. Install dependencies

Install the required Node.js modules using npm:

```
npm install
```

This will install all dependencies listed in `package.json` (including Express, etc.).

### 4. Run the server

To start the server, run:

```
cd api
node https-server.js
```

Or with a custom port:

```
PORT=3000 node https-server.js
```

Or, if you want to use `npm start`, add a start script to your `package.json`:

```
"scripts": {
	"start": "cd api && node https-server.js"
}
```

Then run:

```
npm start
```

### 5. Access the application
Open your browser and go to http://localhost:8080 (or the port you specified via the PORT environment variable).

## 🧰 Manage with PM2
```
sudo pm2 status
sudo pm2 start open-trivia-night
sudo pm2 stop open-trivia-night
sudo pm2 delete open-trivia-night
sudo pm2 start https-server.js --name open-trivia-night
sudo pm2 logs open-trivia-night
```

## Inspect database
```
cd open-trivia-night
sqlite3 quiz.db
```

## Notes
- The server uses HTTPS if SSL certificates are found at `/etc/letsencrypt/live/zipfx.net/` (useful for production). Otherwise, it runs on HTTP (ideal for development or Cloud Run where HTTPS termination is handled externally).
- The server listens on `process.env.PORT` or defaults to 8080.
- For any issues, check the terminal output for errors.

## Game configuration
Game config defaults live in shared and are loaded by the API.

- Default config file: `shared/config.default.json`
- Optional override (ignored by git): `shared/config.json`

To customize questions, copy `shared/config.default.json` to `shared/config.json` and edit the override. The API will prefer the override if it exists.

## 🚀 Deployment

### Google Cloud Run with Cloud Build (Recommended)

This setup uses a `Dockerfile` and `cloudbuild.yaml` for automated deployments.

**Prerequisites:**
- Google Cloud project with Cloud Run and Cloud Build enabled
- Docker image repository (Artifact Registry)
- Git repository connected to Cloud Build trigger

**Steps:**
1. Push your code to GitHub (or your connected Git repository)
2. Cloud Build will automatically detect `cloudbuild.yaml` and build the Docker image
3. The image is pushed to Artifact Registry
4. Deploy to Cloud Run:
   ```bash
   gcloud run deploy open-trivia-night \
     --image=us-west1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/open-trivia-night/open-trivia-night-git \
     --region=us-west1 \
     --platform=managed \
     --port=8080 \
     --memory=512Mi
   ```
5. Cloud Run will automatically handle HTTPS termination

**Notes:**
- The server runs on PORT 8080 (set by Cloud Run automatically)
- No SSL certificates needed (Cloud Run provides HTTPS)
- Database persists in `/app/data` (ephemeral; use Cloud SQL for production)

### Docker

Run the app directly in a Docker container.

**Build the image:**
```bash
docker build -t open-trivia-night:latest .
```

**Run the container:**
```bash
docker run -d \
  --name trivia-night \
  -p 8080:8080 \
  -e PORT=8080 \
  -v trivia-data:/app/data \
  open-trivia-night:latest
```

**View logs:**
```bash
docker logs -f trivia-night
```

**Stop the container:**
```bash
docker stop trivia-night
docker rm trivia-night
```

### Procfile (Heroku / Buildpacks)

If using Heroku or similar buildpack-based platforms, use the provided `Procfile`.

**Deploy to Heroku:**
```bash
heroku login
heroku create your-app-name
git push heroku main
```

**Procfile contents:**
```
web: node api/https-server.js
```

**Set port on Heroku:**
Heroku automatically sets `PORT` via environment variables; the app respects this.

**View logs:**
```bash
heroku logs --tail -a your-app-name
```

### Local PM2 Management

For production-like local deployments, use PM2 with `ecosystem.config.js`.

**Start the app:**
```bash
pm2 start ecosystem.config.js
pm2 save
```

**Manage the app:**
```bash
pm2 status
pm2 logs open-trivia-night
pm2 stop open-trivia-night
pm2 restart open-trivia-night
pm2 delete open-trivia-night
```

**Auto-start on reboot:**
```bash
pm2 startup
pm2 save
```

### Environment Variables

All deployment types respect these environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 8080 | Port the server listens on |

The app automatically:
- Uses HTTPS if SSL certificates exist at `/etc/letsencrypt/live/zipfx.net/`
- Falls back to HTTP otherwise (suitable for Cloud Run or development)
- Creates/initializes the SQLite database on startup
