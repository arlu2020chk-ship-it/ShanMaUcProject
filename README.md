# ShanMaACxNo1 UC Bot

Telegram UC ordering bot.

## Secrets

Do not put the Telegram bot token or admin Telegram ID in this repository.

Set these environment variables in the hosting service:

- BOT_TOKEN
- ADMIN_ID
- DATA_DIR=/data

## Start

npm install
npm start

## Railway persistent storage

Mount a persistent volume at /data and set DATA_DIR=/data.

The bot stays online 24/7. New UC orders are accepted from 9:00 AM to 11:00 PM Myanmar time.