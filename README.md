# WallDesk

A beautiful, feature-rich wallpaper manager for Windows that lets you browse, download, and manage wallpapers from Wallhaven (with Pexels support available but currently disabled for privacy reasons).

![WallDesk Screenshot](docs/screenshot-main.png) <!-- Placeholder for main UI screenshot -->

## ✨ Features

### 🖼️ Wallpaper Discovery
- **Browse Wallhaven's extensive catalog** - Access millions of high-quality wallpapers
- **Smart filtering** - Filter by categories (General/Anime/People), sorting (Trending/Newest/Favorites/etc.), color palette, and resolution
- **Resolution-aware browsing** - Defaults to 1920x1080+ to ensure wallpapers fit your screen properly
- **Infinite scroll** - Seamlessly browse through endless wallpaper collections
- **Offline support** - View previously downloaded wallpapers even without internet connection
- **Collections system** - Import and browse public Wallhaven collections by username/collection ID

### 🎨 Visual Experience
- **Multiple colour themes** - Choose from 6 carefully crafted palettes that work in both light and dark modes
- **Theme flexibility** - Light, dark, or system-following themes
- **Smooth scrolling** (optional) - Fluid navigation with Lenis-powered scrolling
- **Responsive layout** - Optimized for various screen sizes and resolutions
- **Subtle animations** - Polished micro-interactions throughout the interface

### 💾 Wallpaper Management
- **One-click apply** - Set any wallpaper as your desktop background instantly
- **Flexible fitting options** - Choose how wallpapers scale to your screen:
  - **Fill screen** (crop) - Fills screen, may crop edges
  - **Fit to screen** - Shows entire image, may have bars
  - **Stretch** - Stretches to fill (may distort)
  - **Center** - Centers image, shows background color
  - **Span displays** - Spans across multiple monitors
  - **Tile** - Repeats image across desktop
- **Smart downloading** - Automatically saves wallpapers to your `Pictures/WallDesk` folder
- **Download tracking** - Keep track of all downloaded/applied wallpapers with timestamps
- **File management** - Easily delete wallpapers from both the app and disk

### 🔧 Power User Features
- **Wallhaven API key support** - Add your personal API key for higher rate limits and private collections
- **Resolution presets** - Quick selection of common monitor resolutions
- **Landscape-only filtering** - By default hides portrait-orientation wallpapers unsuitable for most monitors
- **Colour palette filtering** - Find wallpapers that match specific colours from Wallhaven's palette
- **Offline mode awareness** - Clear indicators when browsing requires internet vs. when local content is available
- **Automatic updates** - Seamless background update checking with silent installation

### 🖥️ Desktop Integration
- **Native Windows experience** - Built with Tauri for excellent performance and native feel
- **System tray integration** (coming soon) - Quick access from taskbar
- **Auto-start capability** - Launch with Windows for instant wallpaper changes
- **Low resource usage** - Efficient background operation
- **Proper file associations** - Uses Windows-native paths and conventions

## 🚀 Getting Started

### Prerequisites
- Windows 10 or later
- No additional dependencies required

### Installation
1. Download the latest release from the [Releases page](https://github.com/999shotoo/walldesk/releases)
2. Run the installer
3. Launch WallDesk from your Start menu

### First Launch
On first launch, WallDesk will:
1. Show a brief splash screen while initializing
2. Check for updates in the background
3. Load popular wallpapers from Wallhaven
4. Be ready to browse and apply wallpapers!

## 📖 How to Use

### Browsing Wallpapers
- The home screen shows **Popular** wallpapers (Wallhaven's toplist from the past month)
- Use the search bar at the top to find specific wallpapers
- Click any wallpaper to view it in detail
- Use the **Download** button to save a copy
- Use the **Set as Wallpaper** button to apply it immediately

### Applying Wallpapers
When applying a wallpaper, you can choose how it fits your screen:
- **Fill screen**: Crops to fill your entire display (default)
- **Fit to screen**: Shows the entire image with potential bars
- **Stretch**: Stretches to exactly fit (may distort aspect ratio)
- **Center**: Centers the image with background color showing
- **Span displays**: Spans across multiple monitors
- **Tile**: Repeats the image pattern across your desktop

### Managing Your Collection
- Visit the **Downloads** section to see all wallpapers you've saved
- Click the trash icon to remove a wallpaper (deletes the file from disk too)
- Use the **Restore** option if you accidentally delete something
- All files are stored in `Pictures/WallDesk` for easy access outside the app

### Advanced Features
#### Settings
Access settings via the bottom-left gear icon to customize:
- **Appearance**: Theme (light/dark/system) and colour palette
- **Default fit**: How wallpapers are scaled by default
- **Smooth scrolling**: Enable for fluid navigation (requires restart)
- **Wallpaper sizes**: Minimum resolution or exact sizes to browse
- **Wallhaven API key**: Optional key for higher rate limits and private access

#### Collections
Import public Wallhaven collections:
1. Click the **+** button in the sidebar
2. Paste a Wallhaven collection URL (e.g., `https://wallhaven.cc/collections/username/12345`)
3. Browse the collection just like any other feed
4. Collections update live when the owner adds new wallpapers

## 🛠️ Technical Details

WallDesk is built with modern web technologies wrapped in a native desktop shell:

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: Zustand stores with persistence
- **Desktop Shell**: Tauri 2.x with Rust backend
- **API Integration**: Wallhaven API + optional Pexels (currently disabled)
- **Build System**: Cargo + npm + Tauri CLI
- **Packaging**: NSIS installer for Windows distribution

## 📁 File Structure

```
walldesk/
├── src-tauri/              # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs         # Application entry point
│   │   ├── wallpaper.rs    # Desktop integration (setting wallpapers, downloads)
│   │   └── lib.rs          # Command definitions and setup
│   ├── capabilities/       # Security permissions
│   ├── icons/              # Application icons
│   └── tauri.conf.json     # Tauri configuration
├── app/                    # Next.js frontend (app router)
│   ├── (app)/              # Main application routes
│   │   ├── page.tsx        # Home page
│   │   ├── settings.tsx    # Settings page
│   │   └── ...             # Other pages (search, collections, etc.)
├── components/             # Reusable UI components
│   ├── ui/                 # shadcn/ui primitives
│   ├── common/             # App-specific components
│   └── home/               # Home page components
├── lib/                    # Custom hooks and utilities
│   ├── api.ts              # API communication layer
│   ├── settings.ts         # Persistent settings store
│   ├── wallpaper.ts        # Wallpaper-specific utilities
│   ├── store.ts            # Favorites management
│   ├── collections.ts      # Collection imports
│   ├── downloads.ts        # Download tracking
│   ├── offline.ts          # Network status monitoring
│   ├── resolution.ts       # Resolution filtering logic
│   ├── theme.ts            # Colour theme management
│   └── use_palette.ts      # Palette switching
├── public/                 # Static assets
│   └── splashscreen/       # Splash screen images
└── .github/                # GitHub Actions workflows
    └── workflows/
        └── release.yml     # Windows-only release pipeline
```

## 🔒 Privacy & Security

WallDesk respects your privacy:
- **No telemetry** - We don't collect usage data or analytics
- **Local storage only** - All settings, favorites, and downloads stay on your machine
- **Optional API keys** - Wallhaven keys are stored encrypted in local storage
- **Permission-minimal** - Only requests necessary filesystem and network permissions
- **Open source** - Full source code available for inspection

### Network Connections
WallDesk only connects to:
- `wallhaven.cc` - For browsing and downloading wallpapers
- `api.pexels.com` - Currently disabled in the code (would require user-provided API key)
- `github.com` - For checking updates (via the built-in Tauri updater)

## 🤝 Contributing

WallDesk is open source and welcomes contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to:
- Report bugs
- Suggest features
- Submit pull requests
- Set up the development environment

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- [Wallhaven](https://wallhaven.cc/) for providing the wallpaper API
- [Pexels](https://www.pexels.com/) for their photo API (available but disabled by default)
- [Tauri](https://tauri.app/) for the excellent desktop framework
- [Next.js](https://nextjs.org/) for the React framework
- All the open-source libraries used in this project

---

*Made with ❤️ for Windows wallpaper enthusiasts*

<!-- Image placeholders for documentation -->
<details>
<summary>📸 Screenshot Placeholders (for developers)</summary>

| Screenshot | Description |
|------------|-------------|
| ![Main Interface](docs/screenshot-main.png) | Home screen showing popular wallpapers with search bar |
| ![Wallpaper Detail](docs/screenshot-detail.png) | Detailed view of a single wallpaper with actions |
| ![Settings Panel](docs/screenshot-settings.png) | Settings menu with theme, fit mode, and resolution options |
| ![Downloads View](docs/screenshot-downloads.png) | Library of downloaded wallpapers with management options |
| ![Collection Import](docs/screenshot-collections.png) | Dialog for importing Wallhaven collections by URL |
| ![Offline Mode](docs/screenshot-offline.png) | Interface showing when offline with access to local content |

*To add actual screenshots:*
1. Capture images using Windows Snipping Tool or similar
2. Save as PNG in the `/docs/` directory
3. Reference them in the markdown above
</details>