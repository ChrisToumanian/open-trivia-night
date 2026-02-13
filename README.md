# Pub Quiz Web App

This is a static web application for Pub Quiz, including the control panel, join, and questions interfaces.

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

## How to Use
The Node server in `api/https-server.js` now serves these static files on port 81.

### 4. Access the App
Open your browser and go to:
- https://your-server-ip:81/host.html
- https://your-server-ip:81/play.html
- https://your-server-ip:81/questions.html

---

## Notes
- Make sure file permissions allow Node.js to read the files.
- For production, consider using HTTPS and securing your server configuration.

---

## Customize The Look
Branding defaults now live in shared and are loaded automatically by the frontend.

- Default brand file: `shared/brand.default.json`
- Optional override (ignored by git): `shared/brand.json`

To change the theme, edit `shared/brand.json` (or copy the default and adjust it). The app will prefer the override if it exists.

Here are other places to tailor the app to your brand:

- Header logo: Replace `images/logo-header.png` and/or edit `header.html` to change the header markup.
- Footer text/links: Edit `footer.html`.
- Page titles: Update the `<title>` tags in `host.html`, `play.html`, and `questions.html`.
- Favicon: Update the `<link rel="icon">` in each page and replace the referenced icon file in `images/`.
- Colors, fonts, spacing: Adjust shared styles in `styles.css` (e.g., `:root` variables and component classes like `.card`, `.btn`, `.pill`).
- Button labels and UI text: Edit the HTML files for `play.html`, `questions.html`, and `host.html`.

# Pub Quiz API

## Setup Instructions

Follow these steps to set up the project from scratch:

### 1. Install Node.js

If you don't have Node.js installed, download and install it from [nodejs.org](https://nodejs.org/). Recommended version: Node.js 18.x or later.

Alternatively, on Ubuntu you can run:

```
sudo apt update
sudo apt install nodejs npm
```

### 2. Clone the Repository

If you haven't already, clone this repository:

```
git clone <repository-url>
cd pub-quiz
```

### 3. Install Dependencies

Install the required Node.js modules using npm:

```
npm install
```

This will install all dependencies listed in `package.json` (including Express, etc.).

### 4. Run the Server

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

### 5. Access the Application

Open your browser and go to the addresses shown in the terminal (API on https port 3000, web on https port 81).

---

## Start Web App
Start by running
```
sudo node https-server.js
```

## Manage API with PM2
```
sudo pm2 status
sudo pm2 start pub-quiz
sudo pm2 stop pub-quiz
sudo pm2 delete pub-quiz
sudo pm2 start https-server.js --name pub-quiz
sudo pm2 logs pub-quiz
```

## Inspect Database
```
cd pub-quiz
sqlite3 quiz.db
```

## Notes
- Make sure you have the necessary SSL certificates if using HTTPS for the API.
- For development, you may need to allow self-signed certificates in your browser.
- For any issues, check the terminal output for errors.

## Game Configuration
Game config defaults now live in shared and are loaded by the API.

- Default config file: `shared/config.default.json`
- Optional override (ignored by git): `shared/config.json`

To customize questions, copy `shared/config.default.json` to `shared/config.json` and edit the override. The API will prefer the override if it exists.
