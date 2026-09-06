# Friend Arcade — private virtual-coin demo

This is an invite-only, mobile-first social game demo for a private friend circle. It has:

- Color Rush, Aviator and Chicken Road free-play screens
- One-time signup demo notice
- Signup bonus, daily reward and free-play rewards
- Shared leaderboard
- Admin login at `/admin/login`
- Admin demo-credit grants and audit trail
- JSON files instead of an external database
- No real-money deposit, withdrawal, payment, UTR or cash prize features

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env`.
3. Change `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `INVITE_CODE` and `SESSION_SECRET`.
4. Run:

```bash
npm start
```

Open `http://localhost:3000`. Admin login is at `http://localhost:3000/admin/login`.

## Hosting

Upload the root files to a Node.js host, set the environment variables from `.env.example`, and run `npm start`. The `data/` folder must be writable by the Node process. Back up the `data/` folder before upgrades.

This project intentionally uses flat JSON files for a small single-server friend-circle demo. It is not designed for high concurrency, multi-server deployment, financial records or real-money gaming.

## Default invite

The example invite is `FRIEND2026`. Change `INVITE_CODE` in the environment before sharing the app. Existing invite usage is stored in `data/invites.json`.

## Important product boundary

All balances are virtual demo coins. They have no cash value, cannot be purchased, withdrawn, transferred or exchanged. Do not connect payment collection or payout services to this demo.