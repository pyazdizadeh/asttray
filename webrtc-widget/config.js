export const widgetConfig = {
  sip: {
    websocketUrl: "wss://vpr-webrtc.joolio.app:8089/ws",
    host: "vpr-webrtc.joolio.app",
    port: 8089,
    path: "/ws",
    domain: "vpr-webrtc.joolio.app",
    user: "88885555",
    password: "08a9e892ba9840545704021186a6b9aa",
    displayName: "WebRTC User",
  },
  iceServers: [
    { urls: "stun:stun.example.com:3478" },
    {
      urls: "turn:turn.example.com:3478",
      username: "turn-user",
      credential: "turn-pass",
    },
  ],
  destinations: [
    { label: "فروش", extension: "8001" },
    { label: "پشتیبانی", extension: "8002" },
    { label: "مالی", extension: "8003" },
  ],
  enableVideo: true,
  recording: {
    mimeType: "video/webm;codecs=vp9,opus",
  },
  ui: {
    direction: "rtl",
    fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
    floatingButtonPosition: "bottom-right",
    widgetPosition: "bottom-right",
  },
};
