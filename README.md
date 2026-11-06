# Lootify
1. Edit `.env` (BASE_URL, Stripe/PayPal/crypto keys, social login). Admin login is already set there.
2. `npm ci --omit=dev && npm start`  — or Docker: `docker build -t lootify . && docker run -d -p 3000:3000 -v lootify-data:/data --env-file .env lootify`
3. Open `/admin/login` → Products & Pricing to manage games, packages, prices, images and discounts.
Keep `.env` private (it is git/docker-ignored). Serve behind HTTPS.
