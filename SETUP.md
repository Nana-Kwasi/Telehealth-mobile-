# Setup Instructions

## Fixes Applied

1. ✅ Added `react-native-worklets` dependency
2. ✅ Added `@babel/core` dependency  
3. ✅ Updated babel.config.js with reanimated plugin
4. ✅ Created assets folder
5. ✅ Updated package versions to match Expo requirements

## Next Steps

### 1. Create App Icons

You need to add actual image files to the `assets` folder:

- `assets/icon.png` - App icon (1024x1024px recommended)
- `assets/splash.png` - Splash screen image

For now, you can use placeholder images or create simple colored squares.

### 2. Restart Metro Bundler

After installing dependencies, restart the development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
yarn start
```

### 3. Clear Cache (if needed)

If you still see errors, try clearing the cache:

```bash
yarn start --clear
```

### 4. Run on Device

```bash
# iOS
yarn ios

# Android  
yarn android
```

## Troubleshooting

If you see the `react-native-worklets` error:
- Make sure you ran `yarn install` after the package.json update
- Try deleting `node_modules` and reinstalling: `rm -rf node_modules && yarn install`

If you see asset errors:
- Make sure the `assets` folder exists with at least placeholder files
- You can temporarily remove asset references from `app.json` if needed
