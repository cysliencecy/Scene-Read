# SceneReader Mobile

React Native + Expo client for SceneReader.

## API Address

The app reads the backend API from:

```text
EXPO_PUBLIC_API_BASE_URL
```

Copy the example file:

```powershell
cd "F:\codexDemo\Scene Read\mobile"
Copy-Item .env.example .env.local
```

For Web preview on the same computer:

```text
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000
```

For iOS / Android physical devices, use your computer LAN IP instead of `localhost`:

```text
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.23:4000
```

Find the LAN IP on Windows:

```powershell
ipconfig
```

Use the IPv4 address of the Wi-Fi adapter. The phone and computer must be on the same Wi-Fi, and Windows Firewall must allow Node.js on port `4000`.

## Start Backend

```powershell
cd "F:\codexDemo\Scene Read\server"
npm run dev
```

Check from the computer browser:

```text
http://localhost:4000/health
```

Check from the phone browser before opening Expo:

```text
http://YOUR_LAN_IP:4000/health
```

If the phone cannot open `/health`, Expo will not be able to call the backend either.

## Preview On Phones

Start Expo from the mobile directory:

```powershell
cd "F:\codexDemo\Scene Read\mobile"
npx expo start --lan
```

Then:

- iOS: open the Camera app and scan the QR code, or scan from Expo Go.
- Android: open Expo Go and scan the QR code.
- If LAN scan fails, try:

```powershell
npx expo start --tunnel
```

## Expected Flow

1. Start the backend first.
2. Start Expo.
3. Open the app on iOS or Android.
4. Import a TXT / EPUB.
5. Enter the reader page.
6. Confirm the generation status appears.
7. Wait for generated scene images to load.

## Image Loading Notes

Generated scene images are loaded from Supabase Storage public URLs. If text and task status load but images do not:

- Open the image URL in the phone browser.
- Confirm the Supabase bucket is public.
- Confirm the URL is `https://...`, not a computer-only local file path.
