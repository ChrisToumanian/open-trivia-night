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
- controlpanel.html — Admin/control panel interface
- join.html — Participant join page
- questions.html — Quiz/questions interface
- styles.css — Shared styles

## How to Use
You can serve these static files with any web server. Below are instructions for serving with NGINX.

### 4. Access the App
Open your browser and go to:
- http://your-server-ip/controlpanel.html
- http://your-server-ip/join.html
- http://your-server-ip/questions.html
Or, if using a subfolder:
- http://your-server-ip/pub/controlpanel.html

---

## Notes
- Make sure file permissions allow NGINX to read the files.
- For production, consider using HTTPS and securing your NGINX configuration.

---

## Customize The Look
Here are the main places to tailor the app to your brand:

- Header logo: Replace `images/logo-header.png` and/or edit `header.html` to change the header markup.
- Footer text/links: Edit `footer.html`.
- Page titles: Update the `<title>` tags in `controlpanel.html`, `join.html`, and `questions.html`.
- Favicon: Update the `<link rel="icon">` in each page and replace the referenced icon file in `images/`.
- Colors, fonts, spacing: Adjust shared styles in `styles.css` (e.g., `:root` variables and component classes like `.card`, `.btn`, `.pill`).
- Button labels and UI text: Edit the HTML files for `join.html`, `questions.html`, and `controlpanel.html`.

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
sudo node https-server.js
```

Or, if you want to use `npm start`, add a start script to your `package.json`:

```
"scripts": {
	"start": "sudo node https-server.js"
}
```

Then run:

```
npm start
```

### 5. Access the Application

Open your browser and go to the address shown in the terminal (e.g., https://localhost:PORT/).

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
- Make sure you have the necessary SSL certificates if using HTTPS.
- For development, you may need to allow self-signed certificates in your browser.
- For any issues, check the terminal output for errors.
