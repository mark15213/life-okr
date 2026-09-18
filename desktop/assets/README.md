# Hustle Pop Art identity

The red boxing glove represents daily rounds of focused work, completed tasks, and exercise. Thick black contours, primary colors, cream highlights, and halftone patches share a visual language with Gulp.

Generated with the built-in imagegen tool. The approved artwork and full prompt are in `../../design/brand/hustle-pop-art-glove-v1.png` and `../../design/brand/hustle-pop-art-glove-v1.prompt.md`.

`logo-source.png` is the full-color source. `tray-source.png` is a simplified black-on-transparent glove for native macOS template rendering. Its generation prompt is in `../../design/brand/hustle-tray.prompt.md`.

Run `npm --prefix desktop run build:icons` from the repository root using the workspace Sharp dependency. It produces:

- Desktop `icon.png` and, on macOS with Apple iconutil, `icon.icns`.
- Menu bar `trayTemplate.png`, `trayTemplate@2x.png`, and `trayTemplate@3x.png`.
- Next.js `app/icon.png`, multi-resolution `app/favicon.ico`, and `app/apple-icon.png`.
- The opaque 1024×1024 iOS `AppIcon.png` registered in the asset catalog.

Desktop and web PNG/ICO assets preserve transparency. Apple touch and iOS icons use a cream background; the OS applies its own rounded mask. Rebuild the app to include updated assets in distribution packages.
