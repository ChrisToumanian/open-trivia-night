# Pub Quiz Web App

Pub Trivia Night, made effortless. This app bundles everything a host needs into a single, reliable setup: a polished host dashboard for running rounds, a frictionless play page for teams to join in seconds, and a clean questions view that keeps the room focused on the fun. It is lightweight, fast to deploy, and easy to run on a single server, so you can spend less time troubleshooting and more time delivering a memorable pub quiz.

## Why hosts love it
- One server, one command: the web UI and API run together.
- Fast team onboarding: players join with a team name and 4-digit code.
- Smooth game flow: question navigation, scoring, and totals stay in one place.
- Easy to brand: swap logos, colors, and copy without touching code.
- Built for busy nights: minimal setup, predictable URLs, quick resets.

## Quick start
1. Install dependencies: `npm install`
2. Start the server: `cd api && sudo node https-server.js`
3. Open the pages:
	- https://your-server-ip:81/host.html
	- https://your-server-ip:81/play.html
	- https://your-server-ip:81/questions.html

## How it works
- Host opens `host.html` to run the game, review answers, and award points.
- Teams open `play.html`, join with the passcode, and submit answers.
- `questions.html` guides teams through each question.
- The API runs on port 3000 and stores data in SQLite.

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

## Contents
- host.html — Admin/control panel interface
- play.html — Participant join page
- questions.html — Quiz/questions interface
- styles.css — Shared styles

## How to use it
The Node server in `api/https-server.js` serves the frontend on port 81 and the API on port 3000.

### Open the app
- Host dashboard: https://your-server-ip:81/host.html
- Team join page: https://your-server-ip:81/play.html
- Questions view: https://your-server-ip:81/questions.html

### Typical game flow
1. Host opens `host.html` and shares the 4-digit passcode.
2. Teams join at `play.html`, enter a team name and passcode.
3. Teams answer questions in `questions.html`.
4. Host reviews answers, awards points, and advances questions.

## Customize the look
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

# Pub Quiz API

## Setup instructions
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
cd pub-quiz
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
sudo node https-server.js
```

Or, if you want to use `npm start`, add a start script to your `package.json`:

```
"scripts": {
	"start": "cd api && sudo node https-server.js"
}
```

Then run:

```
npm start
```

### 5. Access the application
Open your browser and go to the addresses shown in the terminal (API on https port 3000, web on https port 81).

## Manage with PM2
```
sudo pm2 status
sudo pm2 start pub-quiz
sudo pm2 stop pub-quiz
sudo pm2 delete pub-quiz
sudo pm2 start https-server.js --name pub-quiz
sudo pm2 logs pub-quiz
```

## Inspect database
```
cd pub-quiz
sqlite3 quiz.db
```

## Notes
- Make sure you have the necessary SSL certificates if using HTTPS for the API.
- For development, you may need to allow self-signed certificates in your browser.
- For any issues, check the terminal output for errors.

## Game configuration
Game config defaults live in shared and are loaded by the API.

- Default config file: `shared/config.default.json`
- Optional override (ignored by git): `shared/config.json`

To customize questions, copy `shared/config.default.json` to `shared/config.json` and edit the override. The API will prefer the override if it exists.
