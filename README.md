# 🎮 Steam Dupe Finder Plugin

Automatically identifies and tags games in your vault that are also available in your Steam library.

## 🚀 Quick Setup

1. **Download & Extract:** Get the latest [release](#) and unzip it into your server's mounted `plugins` directory.
2. **Steam API Key:** Grab your personal Steam API Key [here](https://steamcommunity.com/dev/apikey).
3. **Set Your SteamID64:** Find your SteamID64 [here](https://steamid.io) and save it in the environment variable `PLUGIN_PHALCODE_STEAM_DUPE_FINDER_USER_ID_64`.
4. **Configure API Key:** Set your Steam API Key in the environment variable `PLUGIN_PHALCODE_STEAM_DUPE_FINDER_API_KEY`.

You're ready to go!

## 🎯 How It Works

The plugin checks your Steam library daily and compares it against the games stored in your vault. If matches are found, it tags them clearly as `Owned on Steam`.

It smartly matches game names using Levenshtein distance to detect even closely named duplicates. For even greater accuracy, integrate IGDB—it’ll utilize Steam IDs directly from IGDB metadata.

## ⚙️ Usage & Customization

- **Automatic Checks:** Enabled by default (runs every 24 hours).
- **Disable Plugin:** Set `PLUGIN_PHALCODE_STEAM_DUPE_FINDER_INTERVAL` to `0`.

## 🛠️ Configuration Options

| Variable                                             | Description                                                                | Default |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | ------- |
| `PLUGIN_PHALCODE_STEAM_DUPE_FINDER_STEAM_API_KEY`    | Your Steam API Key ([get it here](https://steamcommunity.com/dev/apikey)). | -       |
| `PLUGIN_PHALCODE_STEAM_DUPE_FINDER_STEAM_USER_ID_64` | Your SteamID64 ([find yours](https://steamid.io)).                         | -       |
| `PLUGIN_PHALCODE_STEAM_DUPE_FINDER_INTERVAL`         | Check interval in minutes (`0` disables the plugin).                       | `1440`  |
