# Hustle temporary identity

Created with the built-in imagegen tool on 2026-09-14. The white H suggests forward motion; the amber clock connects it to focus time. The menu bar uses a transparent monochrome variant with native macOS template rendering.

`logo-source.png` and `tray-source.png` are the original generated artwork. `icon.png`, `icon.icns`, and `trayTemplate*.png` are production assets. Run `npm --prefix desktop run build:icons` on macOS to regenerate sizes and ICNS with the workspace Sharp dependency and Apple iconutil. Resizing preserves transparency.

## App icon prompt

Use case: logo-brand. Create one finished macOS application icon for Hustle, a personal productivity and focus timer app. A bold custom white H monogram whose crossbar subtly rises forward, with a small clean clock-like notch or negative-space time cue integrated into the H. Very minimal, memorable, strong readable silhouette at 16px. Centered on a charcoal-black rounded-square macOS icon tile with generous internal padding, tiny warm amber accent only if it improves the time cue. Flat precise vector-like geometry, beautifully balanced optical proportions. Square 1024x1024 asset. Actual transparent background outside the rounded tile; tile fills approximately 88% of canvas. No wordmark, no extra text, no mockup, no presentation sheet, no surrounding objects, no gradients or 3D. Return the actual single production icon.

## Menu bar edit prompt

Create a macOS menu bar template icon variant of this exact H logo. Remove the entire dark rounded square background. Render ONLY the H silhouette and the small clock hands in solid black ink with actual fully transparent background everywhere else, including the clock cutout. Preserve rising crossbar and the clock cutout on upper right. No white ink, no gray background, no tile, no shadows, no gradients. H should fill 80 percent of square canvas, centered, small padding, crisp bold geometry legible at 18x18 pixels. Output a single transparent PNG mask.
