# Icon Requirements

The extension requires three PNG icon files:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

## Design Guidelines

Icons should use only the allowed color palette:
- **Green**: #22c55e (primary green) or #16a34a (darker green)
- **White**: #ffffff
- **Black**: #000000

## Simple Icon Ideas

1. **Clock/Timer**: A simple clock face showing 15 minutes (quarter past)
2. **Number 15**: Just the number "15" in a circle
3. **Time Block**: A simple square or rectangle representing a time block

## Creating Icons

You can create these using:
- Any image editor (Photoshop, GIMP, Figma, etc.)
- Online tools like Canva or Photopea
- Code-based tools like ImageMagick

Example ImageMagick command to create a simple green circle with "15":
```bash
# For 48x48 icon
convert -size 48x48 xc:white -fill "#22c55e" -draw "circle 24,24 24,4" -fill white -font Arial-Bold -pointsize 20 -gravity center -annotate +0+0 "15" icon48.png
```

The extension will work without icons (Chrome shows a default), but custom icons improve the user experience.

