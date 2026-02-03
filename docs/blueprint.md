# **App Name**: TeamDesk

## Core Features:

- ID-Based Connection: Generate unique 9-digit IDs mapped in Redis with TTL for active sessions, enabling AnyDesk-style connections.
- WebRTC Signaling: Implement WebRTC signaling using Socket.io to manage SDP and ICE candidate exchange for P2P connections.
- Remote Desktop Access: Provide remote desktop access via an optimized <canvas> element to receive H.264/VP8 video stream.
- SSH Terminal: Enable SSH access through Xterm.js with FitAddon.
- Dashboard Control: Display linked machines in a real-time 'Bento Grid' interface using TanStack Query for online/offline status polling.
- Floating Toolbar: Include an option to inject keystrokes. Allow two-way clipboard synchronization via the navigator.clipboard API, as well as the option to switch between available monitors in the remote host.
- Guest Authentication: Bypass NextAuth.js login with a 'Zero-Auth' flow using a temporary ID and password for guest access.

## Style Guidelines:

- Primary color: Warm orange (#FF7043) to create a welcoming and energetic feel.
- Background color: Soft beige (#F5F5DC) to provide a comforting and neutral backdrop.
- Accent color: Coral red (#FF4081) to highlight interactive elements and calls to action.
- Body text: 'Open Sans', a sans-serif font, for clear and comfortable readability.
- Headline text: 'Montserrat', a sans-serif font, to ensure the content renders as designed regardless of the computer.
- Code font: 'Source Code Pro' for displaying code snippets clearly.
- Use consistent, minimalist icons with a touch of warmth for actions and status indicators.
- Incorporate subtle animations using Framer Motion for smooth transitions and interactions, especially in the floating toolbar.
- Employ a Bento Grid layout for the dashboard to efficiently display machine thumbnails.