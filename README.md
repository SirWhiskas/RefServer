# RefServer

A local image server for artists. Point it at a folder of reference images on your computer and it serves them up as an API — so you can build or use a web app to browse your library from any device on your network.

---

## What you'll need

- **[Node.js](https://nodejs.org/)** — download and install the LTS version. This is the only technical requirement.
- Your reference image folder somewhere on your hard drive.

---

## Setup

### 1. Download the project

Click the green **Code** button on this page and choose **Download ZIP**. Extract it somewhere on your computer.

### 2. Install dependencies

Open a terminal (on Windows: search for **Command Prompt** or **PowerShell**) and navigate to the folder you extracted:

```
cd path\to\RefServer
```

Then run:

```
npm install
```

### 3. Create your `.env` file

In the RefServer folder, create a new file called exactly `.env` (no other name, no extension). Open it in Notepad or any text editor and paste the following, filling in your own values:

```
IMAGE_ROOT_PATH="C:/path/to/your/images"
COMPRESSED_ROOT_PATH="C:/path/to/your/images_Compressed"
BASE_API_URL="/api/refs"
PORT=8000
API_TOKEN="pick-a-secret-password-here"
```

**What each line means:**

| Variable               | What it does                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `IMAGE_ROOT_PATH`      | The folder on your computer that holds your reference images. Use forward slashes `/` even on Windows.   |
| `COMPRESSED_ROOT_PATH` | Where the compressed copies of your images will be saved. Can be any folder — the server will create it. |
| `BASE_API_URL`         | The URL path the API runs under. You can leave this as-is.                                               |
| `PORT`                 | The port the server runs on. `8000` is fine unless something else on your computer uses it.              |
| `API_TOKEN`            | A secret password that protects your server. Make it something hard to guess.                            |

> **Windows path example:** If your images are in `D:\Art\References`, write it as `D:/Art/References`.

> **Mac/Linux path example:** `/Users/yourname/Pictures/References`

### 4. Compress your images (optional but recommended)

Your original reference images are probably large files. Run this once to create smaller, web-friendly copies in your `COMPRESSED_ROOT_PATH` folder:

```
npm run compress
```

This can take a while depending on how many images you have. It's safe to run again later — it skips images it's already processed, so you can re-run it whenever you add new images.

### 5. Start the server

```
npm start
```

You should see:

```
Server running at http://localhost:8000
```

The server is now running. Keep this terminal window open — closing it stops the server.

---

## Accessing your images

Once the server is running, you can reach it at:

```
http://localhost:8000
```

From other devices on the same Wi-Fi network, replace `localhost` with your computer's local IP address (shown in the terminal when you start the server).

---

## API Token

Every request to the server needs your `API_TOKEN` sent along with it. How you send it depends on the client or app you're using:

- **In request headers:** `x-api-key: your-token`
- **In image URLs:** append `?api_key=your-token` to the URL

---

## Accessing full-resolution images

Compressed images are served at the root. If you need the original full-resolution file, prefix the path with `/originals/`:

- Compressed: `http://localhost:8000/path/to/image.webp`
- Original: `http://localhost:8000/originals/path/to/image.jpg`

---

## Stopping the server

Press `Ctrl + C` in the terminal window where the server is running.

---

## Troubleshooting

**"Cannot find module" error when starting**
Run `npm install` again from the RefServer folder.

**Images aren't showing up**
Double-check your `IMAGE_ROOT_PATH` in the `.env` file. Make sure the folder exists and the path uses forward slashes `/`.

**Port already in use**
Change the `PORT` value in your `.env` file to something else, like `8001`.

**Cache issues / unexpected errors**
Delete the `cache.json` file in the RefServer folder (if it exists) and restart the server. It will rebuild automatically.
